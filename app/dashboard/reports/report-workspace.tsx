"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Project = {
  projectid: string;
  projecttitle: string;
  status?: string;
  clients?: { fullnameorcompanyname: string } | null;
};

type Report = {
  reportid: number;
  projectid: string;
  reportmonth: string;
  filename: string;
  filesize: number;
  uploadedat: string;
  uploadedbyuserid?: string;
  clientnotifiedat: string | null;
  reviewstatus?: "Submitted" | "Reviewed" | "Authorized" | "Rejected";
  progresspct?: number | null;
  supervisorcomments?: string | null;
  supervisorreviewedat?: string | null;
  supervisorreviewedbyuserid?: string | null;
  authorizedat?: string | null;
  authorizedbyuserid?: string | null;
  projects?: {
    projecttitle: string;
    clientid: string;
    status?: string;
    clients?: { fullnameorcompanyname: string } | null;
  } | null;
  users?: { fullname: string } | null;
};

const MAX_FILE_SIZE = 100 * 1024 * 1024;

function currentMonth() {
  return `${new Date().toISOString().slice(0, 7)}-01`;
}

function monthLabel(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-NG", {
    month: "long",
    year: "numeric",
  });
}

function sizeLabel(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(
    bytes < 10 * 1024 * 1024 ? 1 : 0
  )} MB`;
}

function dateTime(value?: string | null) {
  return value
    ? new Date(value).toLocaleString("en-NG")
    : "—";
}

export default function ReportWorkspace({
  projects,
  canUpload,
  canReview,
  canAuthorize,
}: {
  projects: Project[];
  canUpload: boolean;
  canReview: boolean;
  canAuthorize: boolean;
}) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [projectId, setProjectId] = useState(projects[0]?.projectid ?? "");
  const [reportMonth, setReportMonth] = useState(currentMonth());
  const [file, setFile] = useState<File | null>(null);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [monthFilter, setMonthFilter] = useState("All months");

  const [reviewValues, setReviewValues] = useState<
    Record<number, { progress: string; comments: string }>
  >({});

  async function load() {
    setLoading(true);

    const response = await fetch("/api/project-reports", {
      cache: "no-store",
    });

    const body = await response.json();

    if (response.ok) {
      setReports(body);
    } else {
      setMessage(body.error ?? "Could not load Progress Reports.");
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const selectedProject = useMemo(
    () => projects.find((project) => project.projectid === projectId),
    [projects, projectId]
  );

  const availableStatuses = useMemo(
    () =>
      [...new Set(reports.map((report) => report.projects?.status).filter(Boolean))] as string[],
    [reports]
  );

  const availableMonths = useMemo(
    () => [...new Set(reports.map((report) => report.reportmonth))],
    [reports]
  );

  const filteredReports = useMemo(() => {
    const normalized = query.toLowerCase();

    return reports.filter((report) => {
      const clientName =
        report.projects?.clients?.fullnameorcompanyname ?? "";

      const matchesSearch = [
        clientName,
        report.projects?.projecttitle ?? "",
        report.projectid,
        report.filename,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized);

      const matchesStatus =
        statusFilter === "All statuses" ||
        report.projects?.status === statusFilter;

      const matchesMonth =
        monthFilter === "All months" ||
        report.reportmonth === monthFilter;

      return matchesSearch && matchesStatus && matchesMonth;
    });
  }, [reports, query, statusFilter, monthFilter]);

  const groupedReports = useMemo(() => {
    return filteredReports.reduce<Record<string, Report[]>>(
      (groups, report) => {
        const client =
          report.projects?.clients?.fullnameorcompanyname ?? "Client";
        const project = report.projects?.projecttitle ?? report.projectid;
        const status = report.projects?.status ?? "—";

        const key = `${client}|||${project}|||${status}`;

        if (!groups[key]) groups[key] = [];
        groups[key].push(report);

        return groups;
      },
      {}
    );
  }, [filteredReports]);

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!file || !projectId) {
      setMessage("Select a project and PDF report.");
      return;
    }

    if (
      file.type !== "application/pdf" ||
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      setMessage("Only PDF Progress Reports can be uploaded.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setMessage("The PDF must be 100 MB or smaller.");
      return;
    }

    setBusy(true);

    try {
      const request = {
        projectid: projectId,
        reportmonth: reportMonth,
        filename: file.name,
        filesize: file.size,
        mimetype: file.type,
      };

      const signedResponse = await fetch(
        "/api/project-reports/upload-url",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        }
      );

      const signedBody = await signedResponse.json();

      if (!signedResponse.ok) {
        throw new Error(signedBody.error ?? "Could not prepare upload.");
      }

      const { error: uploadError } = await createClient()
        .storage.from("project-reports")
        .uploadToSignedUrl(
          signedBody.storagepath,
          signedBody.token,
          file,
          { contentType: "application/pdf" }
        );

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const completeResponse = await fetch(
        "/api/project-reports/complete",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...request,
            storagepath: signedBody.storagepath,
          }),
        }
      );

      const completeBody = await completeResponse.json();

      if (!completeResponse.ok) {
        throw new Error(
          completeBody.error ?? "Could not save Progress Report details."
        );
      }

      setFile(null);

      const input = document.getElementById(
        "progress-report-file"
      ) as HTMLInputElement | null;

      if (input) input.value = "";

      setMessage(
        completeBody.emailMessage ??
          "Progress Report uploaded and the client notified."
      );

      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Upload failed."
      );
    } finally {
      setBusy(false);
    }
  }

  async function reviewReport(
    report: Report,
    decision: "Reviewed" | "Rejected"
  ) {
    const values = reviewValues[report.reportid] ?? {
      progress: "",
      comments: "",
    };

    if (
      values.progress === "" ||
      Number(values.progress) < 0 ||
      Number(values.progress) > 100
    ) {
      setMessage("Enter a mandatory progress percentage between 0 and 100.");
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/project-reports/${report.reportid}/review`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            progresspct: Number(values.progress),
            comments: values.comments,
          }),
        }
      );

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "Could not review report.");
      }

      setMessage(
        decision === "Reviewed"
          ? "Progress Report reviewed and sent to MD Office."
          : "Progress Report rejected."
      );

      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not review report."
      );
    } finally {
      setBusy(false);
    }
  }

  async function authorizeReport(
    report: Report,
    decision: "Authorized" | "Rejected"
  ) {
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/project-reports/${report.reportid}/authorize`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        }
      );

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "Could not authorize report.");
      }

      setMessage(
        decision === "Authorized"
          ? "Progress Report authorized."
          : "Progress Report rejected."
      );

      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not authorize report."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-7 space-y-6">
      {canUpload && (
        <section className="card p-5 md:p-6">
          <h2 className="text-base font-semibold">Upload Progress Report</h2>
          <p className="mt-1 text-sm text-slate-500">
            PDF only, maximum 100 MB. The client receives an email immediately
            after a successful upload.
          </p>

          <form
            className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
            onSubmit={upload}
          >
            <label>
              <span className="field-label">Client / Project</span>
              <select
                className="field-input"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                required
              >
                <option value="">Select project…</option>
                {projects.map((project) => (
                  <option
                    key={project.projectid}
                    value={project.projectid}
                  >
                    {project.clients?.fullnameorcompanyname ?? "Client"} ·{" "}
                    {project.projecttitle} · {project.projectid}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="field-label">Reporting month</span>
              <input
                className="field-input"
                type="month"
                max={currentMonth().slice(0, 7)}
                value={reportMonth.slice(0, 7)}
                onChange={(event) =>
                  setReportMonth(`${event.target.value}-01`)
                }
                required
              />
            </label>

            <label>
              <span className="field-label">PDF file</span>
              <input
                id="progress-report-file"
                className="field-input pt-2"
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) =>
                  setFile(event.target.files?.[0] ?? null)
                }
                required
              />
            </label>

            <div className="flex items-end">
              <button
                className="btn-primary w-full"
                disabled={busy || !selectedProject}
              >
                {busy ? "Uploading…" : "Upload Progress Report"}
              </button>
            </div>
          </form>
        </section>
      )}

      {message && (
        <p
          role="status"
          className="rounded-md bg-navy-50 px-4 py-3 text-sm text-navy"
        >
          {message}
        </p>
      )}

      <section className="card p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <input
            className="field-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search client, project, code or file…"
          />

          <select
            className="field-input"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option>All statuses</option>
            {availableStatuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>

          <select
            className="field-input"
            value={monthFilter}
            onChange={(event) => setMonthFilter(event.target.value)}
          >
            <option>All months</option>
            {availableMonths.map((value) => (
              <option key={value} value={value}>
                {monthLabel(value)}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="space-y-5">
        {Object.entries(groupedReports).map(([key, group]) => {
          const [clientName, projectName, projectStatus] =
            key.split("|||");

          return (
            <article key={key} className="card overflow-hidden">
              <header className="grid gap-3 border-b bg-slate-50 px-5 py-4 md:grid-cols-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Client
                  </p>
                  <p className="mt-1 font-semibold">{clientName}</p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Project
                  </p>
                  <p className="mt-1 font-semibold">{projectName}</p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Project status
                  </p>
                  <p className="mt-1 font-semibold">{projectStatus}</p>
                </div>
              </header>

              <div className="divide-y divide-slate-100">
                {group.map((report) => {
                  const review = reviewValues[report.reportid] ?? {
                    progress: "",
                    comments: "",
                  };

                  return (
                    <div key={report.reportid} className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold">{report.filename}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            {monthLabel(report.reportmonth)} ·{" "}
                            {sizeLabel(Number(report.filesize))}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            Uploaded by {report.users?.fullname ?? "Operations"} ·{" "}
                            {dateTime(report.uploadedat)}
                          </p>
                        </div>

                        <a
                          className="font-medium text-navy hover:underline"
                          href={`/api/project-reports/download/${report.reportid}`}
                        >
                          View / download
                        </a>
                      </div>

                      <div className="mt-4 grid gap-3 rounded-md bg-slate-50 p-4 text-sm md:grid-cols-4">
                        <div>
                          <p className="text-xs uppercase text-slate-400">
                            Status
                          </p>
                          <p className="mt-1 font-medium">
                            {report.reviewstatus ?? "Submitted"}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs uppercase text-slate-400">
                            Supervisor review
                          </p>
                          <p className="mt-1">
                            {report.supervisorreviewedat
                              ? dateTime(report.supervisorreviewedat)
                              : "Awaiting review"}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs uppercase text-slate-400">
                            % Progress
                          </p>
                          <p className="mt-1">
                            {report.progresspct ?? "—"}
                            {report.progresspct !== null &&
                            report.progresspct !== undefined
                              ? "%"
                              : ""}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs uppercase text-slate-400">
                            MD Office authorization
                          </p>
                          <p className="mt-1">
                            {report.authorizedat
                              ? dateTime(report.authorizedat)
                              : "Awaiting authorization"}
                          </p>
                        </div>
                      </div>

                      {canReview &&
                        (report.reviewstatus ?? "Submitted") ===
                          "Submitted" && (
                          <div className="mt-4 rounded-md border border-slate-200 p-4">
                            <p className="font-medium">
                              Supervisor review
                            </p>

                            <div className="mt-3 grid gap-3 md:grid-cols-[180px_1fr_auto_auto]">
                              <input
                                className="field-input"
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                placeholder="Mandatory % Progress"
                                value={review.progress}
                                onChange={(event) =>
                                  setReviewValues({
                                    ...reviewValues,
                                    [report.reportid]: {
                                      ...review,
                                      progress: event.target.value,
                                    },
                                  })
                                }
                              />

                              <input
                                className="field-input"
                                placeholder="Review comments"
                                value={review.comments}
                                onChange={(event) =>
                                  setReviewValues({
                                    ...reviewValues,
                                    [report.reportid]: {
                                      ...review,
                                      comments: event.target.value,
                                    },
                                  })
                                }
                              />

                              <button
                                className="btn-primary"
                                disabled={busy}
                                onClick={() =>
                                  reviewReport(report, "Reviewed")
                                }
                              >
                                Review
                              </button>

                              <button
                                className="btn-secondary"
                                disabled={busy}
                                onClick={() =>
                                  reviewReport(report, "Rejected")
                                }
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        )}

                      {canAuthorize &&
                        report.reviewstatus === "Reviewed" && (
                          <div className="mt-4 flex flex-wrap gap-3">
                            <button
                              className="btn-primary"
                              disabled={busy}
                              onClick={() =>
                                authorizeReport(report, "Authorized")
                              }
                            >
                              Authorize report
                            </button>

                            <button
                              className="btn-secondary"
                              disabled={busy}
                              onClick={() =>
                                authorizeReport(report, "Rejected")
                              }
                            >
                              Reject report
                            </button>
                          </div>
                        )}
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}

        {!loading && !filteredReports.length && (
          <div className="card p-10 text-center text-slate-400">
            No Progress Reports match the selected filters.
          </div>
        )}

        {loading && (
          <p className="text-center text-slate-400">
            Loading Progress Reports…
          </p>
        )}
      </section>
    </div>
  );
}