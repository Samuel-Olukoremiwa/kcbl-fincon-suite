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
  reportweek: string;
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
  authorizationcomments?: string | null;
  projects?: {
    projecttitle: string;
    clientid: string;
    status?: string;
    clients?: { fullnameorcompanyname: string } | null;
  } | null;
  users?: { fullname: string } | null;
  reviewer?: { fullname: string } | null;
  authorizer?: { fullname: string } | null;
};

const MAX_FILE_SIZE = 100 * 1024 * 1024;

function localDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function currentWeekStart() {
  const today = new Date();

  today.setDate(
    today.getDate() - ((today.getDay() + 6) % 7),
  );

  return localDateValue(today);
}

function weekLabel(value: string) {
  const start = new Date(`${value}T00:00:00`);
  const end = new Date(start);

  end.setDate(start.getDate() + 6);

  return `${start.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })} – ${end.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

function mondayFor(value: string) {
  const date = new Date(`${value}T00:00:00`);

  date.setDate(
    date.getDate() - ((date.getDay() + 6) % 7),
  );

  // Keep the local calendar date.
  // toISOString() would shift a midnight WAT Monday
  // back to Sunday in UTC.
  return localDateValue(date);
}

function sizeLabel(bytes: number) {
  return `${(
    bytes / 1024 / 1024
  ).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
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

  const [projectId, setProjectId] = useState(
    projects[0]?.projectid ?? "",
  );

  const [reportWeek, setReportWeek] =
    useState(currentWeekStart());

  const [file, setFile] = useState<File | null>(null);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState("All statuses");

  const [reviewStatusFilter, setReviewStatusFilter] =
    useState("All request statuses");

  const [weekFilter, setWeekFilter] =
    useState("All weeks");

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [reviewValues, setReviewValues] = useState<
    Record<
      number,
      {
        progress: string;
        comments: string;
      }
    >
  >({});

  const [authorizeReasons, setAuthorizeReasons] =
    useState<Record<number, string>>({});

  const [authorizeRejecting, setAuthorizeRejecting] =
    useState<Record<number, boolean>>({});

  async function load() {
    setLoading(true);

    try {
      const response = await fetch(
        "/api/project-reports",
        {
          cache: "no-store",
        },
      );

      const body = await response.json();

      if (response.ok) {
        setReports(body);
      } else {
        setMessage(
          body.error ??
            "Could not load Progress Reports.",
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not load Progress Reports.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const selectedProject = useMemo(
    () =>
      projects.find(
        (project) =>
          project.projectid === projectId,
      ),
    [projects, projectId],
  );

  const availableStatuses = useMemo(
    () =>
      [
        ...new Set(
          reports
            .map(
              (report) =>
                report.projects?.status,
            )
            .filter(Boolean),
        ),
      ] as string[],
    [reports],
  );

  const availableWeeks = useMemo(
    () =>
      [
        ...new Set(
          reports.map(
            (report) => report.reportweek,
          ),
        ),
      ],
    [reports],
  );

  const filteredReports = useMemo(() => {
    const normalized = query.toLowerCase();

    return reports.filter((report) => {
      const clientName =
        report.projects?.clients
          ?.fullnameorcompanyname ?? "";

      const matchesSearch = [
        clientName,
        report.projects?.projecttitle ?? "",
        report.projectid,
        report.filename,
        report.users?.fullname ?? "",
        report.reviewer?.fullname ?? "",
        report.authorizer?.fullname ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized);

      const matchesStatus =
        statusFilter === "All statuses" ||
        report.projects?.status ===
          statusFilter;

      const matchesWeek =
        weekFilter === "All weeks" ||
        report.reportweek === weekFilter;

      const matchesRequestStatus =
        reviewStatusFilter ===
          "All request statuses" ||
        (report.reviewstatus ??
          "Submitted") ===
          reviewStatusFilter;

      const uploadedDate =
        report.uploadedat.slice(0, 10);

      const matchesDateRange =
        (!fromDate ||
          uploadedDate >= fromDate) &&
        (!toDate || uploadedDate <= toDate);

      return (
        matchesSearch &&
        matchesStatus &&
        matchesWeek &&
        matchesRequestStatus &&
        matchesDateRange
      );
    });
  }, [
    reports,
    query,
    statusFilter,
    reviewStatusFilter,
    weekFilter,
    fromDate,
    toDate,
  ]);

  const groupedReports = useMemo(() => {
    return filteredReports.reduce<
      Record<string, Report[]>
    >((groups, report) => {
      const client =
        report.projects?.clients
          ?.fullnameorcompanyname ??
        "Client";

      const project =
        report.projects?.projecttitle ??
        report.projectid;

      const status =
        report.projects?.status ?? "—";

      const key = `${client}|||${project}|||${status}`;

      if (!groups[key]) {
        groups[key] = [];
      }

      groups[key].push(report);

      return groups;
    }, {});
  }, [filteredReports]);

  async function upload(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setMessage(null);

    if (!file || !projectId) {
      setMessage(
        "Select a project and PDF report.",
      );
      return;
    }

    if (
      file.type !== "application/pdf" ||
      !file.name
        .toLowerCase()
        .endsWith(".pdf")
    ) {
      setMessage(
        "Only PDF Progress Reports can be uploaded.",
      );
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setMessage(
        "The PDF must be 100 MB or smaller.",
      );
      return;
    }

    setBusy(true);

    try {
      const request = {
        projectid: projectId,
        reportweek: reportWeek,
        filename: file.name,
        filesize: file.size,
        mimetype: file.type,
      };

      const signedResponse = await fetch(
        "/api/project-reports/upload-url",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
        },
      );

      const signedBody =
        await signedResponse.json();

      if (!signedResponse.ok) {
        throw new Error(
          signedBody.error ??
            "Could not prepare upload.",
        );
      }

      const { error: uploadError } =
        await createClient()
          .storage
          .from("project-reports")
          .uploadToSignedUrl(
            signedBody.storagepath,
            signedBody.token,
            file,
            {
              contentType: "application/pdf",
            },
          );

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const completeResponse =
        await fetch(
          "/api/project-reports/complete",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              ...request,
              storagepath:
                signedBody.storagepath,
            }),
          },
        );

      const completeBody =
        await completeResponse.json();

      if (!completeResponse.ok) {
        throw new Error(
          completeBody.error ??
            "Could not save Progress Report details.",
        );
      }

      setFile(null);

      const input =
        document.getElementById(
          "progress-report-file",
        ) as HTMLInputElement | null;

      if (input) {
        input.value = "";
      }

      setMessage(
        completeBody.emailMessage ??
          "Progress Report uploaded and sent for supervisor review.",
      );

      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Upload failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function reviewReport(
    report: Report,
    decision: "Reviewed" | "Rejected",
  ) {
    const values =
      reviewValues[report.reportid] ?? {
        progress: "",
        comments: "",
      };

    if (
      values.progress === "" ||
      Number(values.progress) < 0 ||
      Number(values.progress) > 100
    ) {
      setMessage(
        "Enter a mandatory progress percentage between 0 and 100.",
      );
      return;
    }

    if (
      decision === "Rejected" &&
      !values.comments.trim()
    ) {
      setMessage(
        "Enter a reason for rejecting this report.",
      );
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/project-reports/${report.reportid}/review`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            decision,
            progresspct: Number(
              values.progress,
            ),
            comments: values.comments,
          }),
        },
      );

      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body.error ??
            "Could not review report.",
        );
      }

      setMessage(
        decision === "Reviewed"
          ? "Progress Report reviewed and sent to MD Office."
          : body.emailSent
            ? "Progress Report rejected and the uploader notified by email."
            : `Progress Report rejected. The uploader could not be emailed — ${
                body.emailError ??
                "verify Resend setup."
              }`,
      );

      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not review report.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function authorizeReport(
    report: Report,
    decision: "Authorized" | "Rejected",
  ) {
    const reason =
      authorizeReasons[report.reportid] ?? "";

    if (
      decision === "Rejected" &&
      !reason.trim()
    ) {
      setMessage(
        "Enter a reason for rejecting this report.",
      );
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/project-reports/${report.reportid}/authorize`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            decision,
            comments:
              decision === "Rejected"
                ? reason
                : undefined,
          }),
        },
      );

      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body.error ??
            "Could not authorize report.",
        );
      }

      setMessage(
        decision === "Authorized"
          ? body.emailSent
            ? "Progress Report authorized and the client notified."
            : `Progress Report authorized. The client could not be emailed — ${
                body.emailError ??
                "verify Resend setup."
              }`
          : body.emailSent
            ? "Progress Report rejected and the uploader notified by email."
            : `Progress Report rejected. The uploader could not be emailed — ${
                body.emailError ??
                "verify Resend setup."
              }`,
      );

      setAuthorizeRejecting(
        (prev) => ({
          ...prev,
          [report.reportid]: false,
        }),
      );

      setAuthorizeReasons(
        (prev) => ({
          ...prev,
          [report.reportid]: "",
        }),
      );

      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not authorize report.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-7 space-y-6">
      {canUpload && (
        <section className="card p-5 md:p-6">
          <h2 className="text-base font-semibold">
            Upload Progress Report
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            PDF only, maximum 100 MB. The
            client is notified only after
            supervisor review and MD Office
            authorization are complete.
          </p>

          <form
            className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
            onSubmit={upload}
          >
            <label>
              <span className="field-label">
                Client / Project
              </span>

              <select
                className="field-input"
                value={projectId}
                onChange={(event) =>
                  setProjectId(
                    event.target.value,
                  )
                }
                required
              >
                <option value="">
                  Select project…
                </option>

                {projects.map((project) => (
                  <option
                    key={project.projectid}
                    value={project.projectid}
                  >
                    {project.clients
                      ?.fullnameorcompanyname ??
                      "Client"}{" "}
                    · {project.projecttitle} ·{" "}
                    {project.projectid}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="field-label">
                Reporting week
              </span>

              <input
                className="field-input"
                type="date"
                max={localDateValue(
                  new Date(),
                )}
                value={reportWeek}
                onChange={(event) =>
                  setReportWeek(
                    mondayFor(
                      event.target.value,
                    ),
                  )
                }
                required
              />
            </label>

            <label>
              <span className="field-label">
                PDF file
              </span>

              <input
                id="progress-report-file"
                className="field-input pt-2"
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) =>
                  setFile(
                    event.target.files?.[0] ??
                      null,
                  )
                }
                required
              />
            </label>

            <div className="flex items-end">
              <button
                type="submit"
                className="btn-primary w-full"
                disabled={
                  busy || !selectedProject
                }
              >
                {busy
                  ? "Uploading…"
                  : "Upload Progress Report"}
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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <input
            className="field-input"
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            placeholder="Search client, project, code or file…"
          />

          <select
            className="field-input"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value,
              )
            }
          >
            <option>All statuses</option>

            {availableStatuses.map(
              (status) => (
                <option
                  key={status}
                >
                  {status}
                </option>
              ),
            )}
          </select>

          <select
            className="field-input"
            value={reviewStatusFilter}
            onChange={(event) =>
              setReviewStatusFilter(
                event.target.value,
              )
            }
          >
            <option>
              All request statuses
            </option>
            <option>Submitted</option>
            <option>Reviewed</option>
            <option>Authorized</option>
            <option>Rejected</option>
          </select>

          <select
            className="field-input"
            value={weekFilter}
            onChange={(event) =>
              setWeekFilter(
                event.target.value,
              )
            }
          >
            <option>All weeks</option>

            {availableWeeks.map(
              (value) => (
                <option
                  key={value}
                  value={value}
                >
                  {weekLabel(value)}
                </option>
              ),
            )}
          </select>

          <label>
            <span className="field-label">
              Uploaded from
            </span>

            <input
              className="field-input"
              type="date"
              value={fromDate}
              onChange={(event) =>
                setFromDate(
                  event.target.value,
                )
              }
            />
          </label>

          <label>
            <span className="field-label">
              Uploaded to
            </span>

            <input
              className="field-input"
              type="date"
              value={toDate}
              onChange={(event) =>
                setToDate(
                  event.target.value,
                )
              }
            />
          </label>
        </div>
      </section>

      <section className="space-y-5">
        {Object.entries(
          groupedReports,
        ).map(([key, group]) => {
          const [
            clientName,
            projectName,
            projectStatus,
          ] = key.split("|||");

          return (
            <article
              key={key}
              className="card overflow-hidden"
            >
              <header className="grid gap-3 border-b bg-slate-50 px-5 py-4 md:grid-cols-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Client
                  </p>

                  <p className="mt-1 font-semibold">
                    {clientName}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Project
                  </p>

                  <p className="mt-1 font-semibold">
                    {projectName}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Project status
                  </p>

                  <p className="mt-1 font-semibold">
                    {projectStatus}
                  </p>
                </div>
              </header>

              <div className="divide-y divide-slate-100">
                {group.map((report) => {
                  const review =
                    reviewValues[
                      report.reportid
                    ] ?? {
                      progress: "",
                      comments: "",
                    };

                  const isRejectingAuthorize =
                    authorizeRejecting[
                      report.reportid
                    ] ?? false;

                  return (
                    <div
                      key={report.reportid}
                      className="p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold">
                            {report.filename}
                          </p>

                          <p className="mt-1 text-sm text-slate-500">
                            Week of{" "}
                            {weekLabel(
                              report.reportweek,
                            )}{" "}
                            ·{" "}
                            {sizeLabel(
                              Number(
                                report.filesize,
                              ),
                            )}
                          </p>

                          <p className="mt-1 text-xs text-slate-400">
                            Uploaded by{" "}
                            {report.users
                              ?.fullname ??
                              "Operations"}{" "}
                            ·{" "}
                            {dateTime(
                              report.uploadedat,
                            )}
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
                            {report.reviewstatus ??
                              "Submitted"}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs uppercase text-slate-400">
                            Supervisor review
                          </p>

                          <p className="mt-1">
                            {report.supervisorreviewedat
                              ? `${
                                  report
                                    .reviewer
                                    ?.fullname ??
                                  "Supervisor"
                                } · ${dateTime(
                                  report.supervisorreviewedat,
                                )}`
                              : "Awaiting review"}
                          </p>

                          {report.reviewstatus ===
                            "Rejected" &&
                            report.supervisorcomments && (
                              <p className="mt-1 text-xs text-red-600">
                                Reason:{" "}
                                {
                                  report.supervisorcomments
                                }
                              </p>
                            )}
                        </div>

                        <div>
                          <p className="text-xs uppercase text-slate-400">
                            % Progress
                          </p>

                          <p className="mt-1">
                            {report.progresspct ??
                              "—"}

                            {report.progresspct !==
                              null &&
                            report.progresspct !==
                              undefined
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
                              ? `${
                                  report
                                    .authorizer
                                    ?.fullname ??
                                  "MD Office"
                                } · ${dateTime(
                                  report.authorizedat,
                                )}`
                              : "Awaiting authorization"}
                          </p>

                          {report.authorizationcomments && (
                            <p className="mt-1 text-xs text-red-600">
                              Reason:{" "}
                              {
                                report.authorizationcomments
                              }
                            </p>
                          )}

                          {report.reviewstatus ===
                            "Authorized" && (
                            <p className="mt-1 text-xs text-slate-400">
                              Client notified:{" "}
                              {report.clientnotifiedat
                                ? dateTime(
                                    report.clientnotifiedat,
                                  )
                                : "Not yet sent"}
                            </p>
                          )}
                        </div>
                      </div>

                      {canReview &&
                        (report.reviewstatus ??
                          "Submitted") ===
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
                                value={
                                  review.progress
                                }
                                onChange={(
                                  event,
                                ) =>
                                  setReviewValues(
                                    (prev) => ({
                                      ...prev,
                                      [report.reportid]:
                                        {
                                          ...review,
                                          progress:
                                            event
                                              .target
                                              .value,
                                        },
                                    }),
                                  )
                                }
                              />

                              <input
                                className="field-input"
                                placeholder="Review comments (required to reject)"
                                value={
                                  review.comments
                                }
                                onChange={(
                                  event,
                                ) =>
                                  setReviewValues(
                                    (prev) => ({
                                      ...prev,
                                      [report.reportid]:
                                        {
                                          ...review,
                                          comments:
                                            event
                                              .target
                                              .value,
                                        },
                                    }),
                                  )
                                }
                              />

                              <button
                                type="button"
                                className="btn-primary"
                                disabled={busy}
                                onClick={() =>
                                  reviewReport(
                                    report,
                                    "Reviewed",
                                  )
                                }
                              >
                                Review
                              </button>

                              <button
                                type="button"
                                className="btn-secondary"
                                disabled={busy}
                                onClick={() =>
                                  reviewReport(
                                    report,
                                    "Rejected",
                                  )
                                }
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        )}

                      {canAuthorize &&
                        report.reviewstatus ===
                          "Reviewed" && (
                          <div className="mt-4">
                            {isRejectingAuthorize ? (
                              <div className="rounded-md border border-slate-200 p-4">
                                <p className="font-medium">
                                  Reject report
                                </p>

                                <div className="mt-3 flex flex-wrap gap-2">
                                  <input
                                    className="field-input max-w-sm"
                                    placeholder="Reason for rejection (required)"
                                    value={
                                      authorizeReasons[
                                        report
                                          .reportid
                                      ] ?? ""
                                    }
                                    onChange={(
                                      event,
                                    ) =>
                                      setAuthorizeReasons(
                                        (prev) => ({
                                          ...prev,
                                          [report.reportid]:
                                            event
                                              .target
                                              .value,
                                        }),
                                      )
                                    }
                                  />

                                  <button
                                    type="button"
                                    className="btn-primary"
                                    disabled={busy}
                                    onClick={() =>
                                      authorizeReport(
                                        report,
                                        "Rejected",
                                      )
                                    }
                                  >
                                    Confirm rejection
                                  </button>

                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() =>
                                      setAuthorizeRejecting(
                                        (prev) => ({
                                          ...prev,
                                          [report.reportid]:
                                            false,
                                        }),
                                      )
                                    }
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-3">
                                <button
                                  type="button"
                                  className="btn-primary"
                                  disabled={busy}
                                  onClick={() =>
                                    authorizeReport(
                                      report,
                                      "Authorized",
                                    )
                                  }
                                >
                                  Authorize report
                                </button>

                                <button
                                  type="button"
                                  className="btn-secondary"
                                  disabled={busy}
                                  onClick={() =>
                                    setAuthorizeRejecting(
                                      (prev) => ({
                                        ...prev,
                                        [report.reportid]:
                                          true,
                                      }),
                                    )
                                  }
                                >
                                  Reject report
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}

        {!loading &&
          !filteredReports.length && (
            <div className="card p-10 text-center text-slate-400">
              No Progress Reports match the
              selected filters.
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