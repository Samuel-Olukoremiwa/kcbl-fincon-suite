import { redirect } from "next/navigation";
import {
  FileText,
  FolderKanban,
  CreditCard,
  CalendarDays,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const viewer = await getViewer();

  if (viewer.userType !== "Client") {
    redirect("/dashboard?error=forbidden");
  }

  const supabase = createClient();

  /*
   * =========================================================
   * CLIENT
   * =========================================================
   */
  const { data: client } = await supabase
    .from("clients")
    .select(
      "clientid,fullnameorcompanyname,email,phonenumber,address",
    )
    .eq("linkeduserid", viewer.userId)
    .maybeSingle();

  if (!client) {
    redirect("/dashboard?error=client-not-found");
  }

  /*
   * =========================================================
   * PROJECTS + CLIENT PAYMENTS
   * =========================================================
   */
  const [{ data: projects }, { data: inflows }] =
    await Promise.all([
      supabase
        .from("projects")
        .select(
          `
            projectid,
            projecttitle,
            projectlocation,
            status,
            estimatedvalue,
            startdate,
            expectedenddate,
            clientid
          `,
        )
        .eq("clientid", client.clientid)
        .order("projectid"),

      supabase
        .from("cashinflowreceivables")
        .select(
          `
            transactionid,
            projectid,
            amount,
            transactiondate,
            paymentmethod,
            description,
            approvalstatus
          `,
        )
        .eq("clientid", client.clientid)
        .order("transactiondate", {
          ascending: false,
        }),
    ]);

  const projectIds = (projects ?? []).map(
    (project) => project.projectid,
  );

  /*
   * =========================================================
   * PROJECT PROGRESS
   * =========================================================
   *
   * Only Authorized progress reports affect the percentage
   * shown to the client.
   *
   * Multiple reports may exist for the same project/week.
   *
   * Ordering:
   * 1. Latest report week
   * 2. Latest authorization time
   * 3. Latest report ID as tie-breaker
   */
  let authorizedReports: {
    projectid: string;
    reportweek: string;
    progresspct: number | string | null;
    authorizedat: string | null;
    reportid: number;
  }[] = [];

  if (projectIds.length > 0) {
    const { data, error } = await supabase
      .from("projectreports")
      .select(
        `
          projectid,
          reportweek,
          progresspct,
          authorizedat,
          reportid
        `,
      )
      .in("projectid", projectIds)
      .eq("reviewstatus", "Authorized")
      .not("progresspct", "is", null)
      .order("reportweek", {
        ascending: false,
      })
      .order("authorizedat", {
        ascending: false,
      })
      .order("reportid", {
        ascending: false,
      });

    if (error) {
      console.error(
        "Failed to load authorized project reports:",
        error,
      );
    } else {
      authorizedReports = data ?? [];
    }
  }

  const progressByProject = new Map<
    string,
    {
      pct: number;
      week: string;
    }
  >();

  /*
   * Reports are already sorted newest-first.
   * Therefore, the first Authorized report found for a
   * project becomes its current displayed progress.
   */
  authorizedReports.forEach((report) => {
    if (!progressByProject.has(report.projectid)) {
      progressByProject.set(report.projectid, {
        pct: Number(report.progresspct),
        week: report.reportweek,
      });
    }
  });

  /*
   * =========================================================
   * APPROVED PAYMENTS ONLY
   * =========================================================
   *
   * Pending and Rejected inflows must not affect:
   *
   * - Total Paid
   * - Outstanding Balance
   * - Percentage Paid
   */
  const approvedInflows = (inflows ?? []).filter(
    (transaction) =>
      transaction.approvalstatus === "Approved",
  );

  /*
   * =========================================================
   * COMPLETE PROJECT VIEW
   * =========================================================
   *
   * Each project gets:
   *
   * - Contract Value
   * - Total Paid
   * - Outstanding Balance
   * - Percentage Paid
   * - Current Authorized Progress
   */
  const projectRows = (projects ?? []).map((project) => {
    const projectPayments = approvedInflows.filter(
      (transaction) =>
        transaction.projectid === project.projectid,
    );

    const totalPaid = projectPayments.reduce(
      (total, transaction) =>
        total + Number(transaction.amount ?? 0),
      0,
    );

    const contractValue =
      project.estimatedvalue != null
        ? Number(project.estimatedvalue)
        : null;

    const outstandingBalance =
      contractValue != null
        ? Math.max(contractValue - totalPaid, 0)
        : null;

    const percentagePaid =
      contractValue != null && contractValue > 0
        ? (totalPaid / contractValue) * 100
        : null;

    return {
      ...project,

      progress:
        progressByProject.get(project.projectid) ??
        null,

      projectPayments,

      contractValue,

      totalPaid,

      outstandingBalance,

      percentagePaid,
    };
  });

  /*
   * =========================================================
   * DOCUMENTS
   * =========================================================
   *
   * Client-level:
   *
   * relatedentity = "Clients"
   * relatedrecordid = client.clientid
   *
   * Project-level:
   *
   * relatedentity = "Project"
   * relatedrecordid = project.projectid
   *
   * Only Verified documents are displayed.
   */
  type PortalDocument = {
    documentid: string;
    relatedentity: string;
    relatedrecordid: string;
    documenttype: string;
    filename: string;
    filepath: string;
    uploaddate: string;
    verificationstatus: string;
  };

  let documents: PortalDocument[] = [];

  const documentRecordIds = [
    client.clientid,
    ...projectIds,
  ];

  if (documentRecordIds.length > 0) {
    const { data, error } = await supabase
      .from("documents")
      .select(
        `
          documentid,
          relatedentity,
          relatedrecordid,
          documenttype,
          filename,
          filepath,
          uploaddate,
          verificationstatus
        `,
      )
      .in(
        "relatedrecordid",
        documentRecordIds,
      )
      .eq(
        "verificationstatus",
        "Verified",
      )
      .order("uploaddate", {
        ascending: false,
      });

    if (error) {
      console.error(
        "Failed to load client documents:",
        error,
      );
    } else {
      documents = (data ?? []).filter(
        (document) =>
          (document.relatedentity === "Clients" &&
            document.relatedrecordid ===
              client.clientid) ||
          (document.relatedentity === "Project" &&
            projectIds.includes(
              document.relatedrecordid,
            )),
      );
    }
  }

  /*
   * =========================================================
   * HELPERS
   * =========================================================
   */
  const formatDate = (
    value: string | null,
  ) => {
    if (!value) {
      return "—";
    }

    return new Intl.DateTimeFormat(
      "en-GB",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      },
    ).format(new Date(value));
  };

  const formatMoney = (
    value: number,
  ) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 2,
    }).format(value);

  const formatPercentage = (
    value: number,
  ) =>
    `${new Intl.NumberFormat("en-NG", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value)}%`;

  const projectNameById = new Map(
    (projects ?? []).map((project) => [
      project.projectid,
      project.projecttitle,
    ]),
  );

  /*
   * =========================================================
   * PAGE
   * =========================================================
   */
  return (
    <div className="space-y-8">
      {/* =====================================================
          HEADER
      ====================================================== */}
      <header>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white">
            <FolderKanban size={20} />
          </div>

          <div>
            <h1 className="text-xl font-semibold">
              Client Portal
            </h1>

            <p className="text-sm text-slate-500">
              Welcome,{" "}
              {client.fullnameorcompanyname}.
            </p>
          </div>
        </div>
      </header>

      {/* =====================================================
          MY PROJECTS
      ====================================================== */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <FolderKanban
            size={18}
            className="text-navy"
          />

          <h2 className="text-lg font-semibold">
            My Projects
          </h2>
        </div>

        {projectRows.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
            No projects are currently
            associated with your account.
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {projectRows.map((project) => {
              const progress =
                project.progress;

              return (
                <div
                  key={project.projectid}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  {/* Project heading */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        {project.projectid}
                      </p>

                      <h3 className="mt-1 text-lg font-semibold text-ink">
                        {project.projecttitle}
                      </h3>
                    </div>

                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      {project.status}
                    </span>
                  </div>

                  {/* Main project information */}
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">
                        Location
                      </p>

                      <p className="mt-1 text-sm text-slate-700">
                        {project.projectlocation ||
                          "—"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">
                        Contract Value
                      </p>

                      <p className="mt-1 text-sm font-semibold text-slate-700">
                        {project.contractValue !=
                        null
                          ? formatMoney(
                              project.contractValue,
                            )
                          : "—"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">
                        Start Date
                      </p>

                      <p className="mt-1 text-sm text-slate-700">
                        {formatDate(
                          project.startdate,
                        )}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">
                        Expected End
                      </p>

                      <p className="mt-1 text-sm text-slate-700">
                        {formatDate(
                          project.expectedenddate,
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Financial position */}
                  <div className="mt-5 border-t border-slate-200 pt-5">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Payment Position
                    </p>

                    <div className="grid gap-3 sm:grid-cols-3">
                      {/* Total Paid */}
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-400">
                          Total Paid
                        </p>

                        <p className="mt-1 font-bold text-ink">
                          {formatMoney(
                            project.totalPaid,
                          )}
                        </p>
                      </div>

                      {/* Outstanding */}
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-400">
                          Outstanding Balance
                        </p>

                        <p className="mt-1 font-bold text-ink">
                          {project.outstandingBalance !=
                          null
                            ? formatMoney(
                                project.outstandingBalance,
                              )
                            : "—"}
                        </p>
                      </div>

                      {/* Percentage Paid */}
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-400">
                          Percentage Paid
                        </p>

                        <p className="mt-1 text-xl font-extrabold text-navy">
                          {project.percentagePaid !=
                          null
                            ? formatPercentage(
                                project.percentagePaid,
                              )
                            : "—"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Project progress */}
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Project Progress
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          {progress
                            ? `Latest authorized report — week of ${formatDate(
                                progress.week,
                              )}`
                            : "No authorized progress report yet."}
                        </p>
                      </div>

                      <span className="text-2xl font-extrabold text-navy">
                        {progress
                          ? `${progress.pct}%`
                          : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* =====================================================
          PAYMENT HISTORY
      ====================================================== */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <CreditCard
            size={18}
            className="text-navy"
          />

          <h2 className="text-lg font-semibold">
            Payment History
          </h2>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {approvedInflows.length === 0 ? (
            <div className="p-5 text-sm text-slate-500">
              No approved payments found.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {approvedInflows.map(
                (transaction) => {
                  const projectTitle =
                    transaction.projectid
                      ? projectNameById.get(
                          transaction.projectid,
                        )
                      : null;

                  return (
                    <div
                      key={
                        transaction.transactionid
                      }
                      className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-ink">
                          {transaction.description ||
                            "Project payment"}
                        </p>

                        {transaction.projectid && (
                          <p className="mt-1 text-xs font-medium text-navy">
                            {projectTitle ||
                              transaction.projectid}

                            {projectTitle
                              ? ` · ${transaction.projectid}`
                              : ""}
                          </p>
                        )}

                        <p className="mt-1 text-xs text-slate-500">
                          {formatDate(
                            transaction.transactiondate,
                          )}{" "}
                          ·{" "}
                          {transaction.paymentmethod}
                        </p>
                      </div>

                      <p className="shrink-0 text-base font-bold text-ink">
                        {formatMoney(
                          Number(
                            transaction.amount,
                          ),
                        )}
                      </p>
                    </div>
                  );
                },
              )}
            </div>
          )}
        </div>
      </section>

      {/* =====================================================
          DOCUMENTS
      ====================================================== */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <FileText
            size={18}
            className="text-navy"
          />

          <h2 className="text-lg font-semibold">
            Documents
          </h2>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          {documents.length === 0 ? (
            <div className="p-5 text-sm text-slate-500">
              No verified documents are
              currently available.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {documents.map((document) => (
                <div
                  key={document.documentid}
                  className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-ink">
                      {document.filename}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {document.documenttype ||
                        "Document"}{" "}
                      ·{" "}
                      {formatDate(
                        document.uploaddate,
                      )}
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      {document.relatedentity ===
                      "Clients"
                        ? "Client document"
                        : "Project document"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* =====================================================
          PROGRESS INFORMATION
      ====================================================== */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <CalendarDays
            size={18}
            className="text-navy"
          />

          <div>
            <p className="font-medium text-ink">
              Progress reporting
            </p>

            <p className="mt-1 text-sm text-slate-500">
              Project progress shown here is
              based only on authorized progress
              reports. New submissions do not
              change the displayed percentage
              until they are authorized.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}