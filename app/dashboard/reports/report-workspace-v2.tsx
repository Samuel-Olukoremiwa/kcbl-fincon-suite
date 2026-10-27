"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import ReportAttachmentViewer from "./report-attachment-viewer";

type Project = {
  projectid: string;
  projecttitle: string;
  status?: string;
  assignmentrole: string;
  clients?: {
    fullnameorcompanyname: string;
  } | null;
};

type ReportPdf = {
  pdfid: number;
  filename: string;
  filesize: number;
  uploadedat: string;
};

type ReportMedia = {
  mediaid: number;
  filename: string;
  filesize: number;
  mimetype: string;
  mediatype:
    | "Image"
    | "Video";
  uploadedat: string;
};

type Report = {
  reportid: number;
  projectid: string;
  reportweek: string;
  reportdate?: string | null;
  reporttype:
    | "Operations"
    | "Project Manager";
  filename: string;
  filesize: number;
  uploadedat: string;
  uploadedbyuserid?: string;
  clientnotifiedat:
    | string
    | null;
  reviewstatus?:
    | "Submitted"
    | "Reviewed"
    | "Authorized"
    | "Rejected";
  progresspct?:
    | number
    | null;
  supervisorcomments?:
    | string
    | null;
  supervisorreviewedat?:
    | string
    | null;
  authorizationcomments?:
    | string
    | null;
  authorizedat?:
    | string
    | null;
  projects?: {
    projecttitle: string;
    clientid: string;
    status?: string;
    clients?: {
      fullnameorcompanyname: string;
    } | null;
  } | null;
  users?: {
    fullname: string;
  } | null;
  reviewer?: {
    fullname: string;
  } | null;
  authorizer?: {
    fullname: string;
  } | null;
  projectreportmedia?:
    ReportMedia[] | null;
  projectreportpdfs?: ReportPdf[] | null;
};

const MAX_PDFS_PER_REPORT = 8;

const MAX_FILE_SIZE =
  100 * 1024 * 1024;

const MAX_IMAGE_SIZE =
  5 * 1024 * 1024;

const MAX_VIDEO_SIZE =
  25 * 1024 * 1024;

const MAX_MEDIA_FILES = 6;

const MAX_MEDIA_TOTAL =
  50 * 1024 * 1024;

function localDateValue(
  date: Date,
) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1,
    ).padStart(2, "0");

  const day =
    String(
      date.getDate(),
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function currentWeekStart() {
  const today =
    new Date();

  today.setDate(
    today.getDate() -
      ((
        today.getDay() +
        6
      ) %
        7),
  );

  return localDateValue(
    today,
  );
}

function weekLabel(
  value: string,
) {
  const start =
    new Date(
      `${value}T00:00:00`,
    );

  const end =
    new Date(start);

  end.setDate(
    start.getDate() + 6,
  );

  return `${start.toLocaleDateString(
    "en-NG",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    },
  )} – ${end.toLocaleDateString(
    "en-NG",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    },
  )}`;
}

function mondayFor(
  value: string,
) {
  const date =
    new Date(
      `${value}T00:00:00`,
    );

  date.setDate(
    date.getDate() -
      ((
        date.getDay() +
        6
      ) %
        7),
  );

  return localDateValue(
    date,
  );
}

function sizeLabel(
  bytes: number,
) {
  return `${(
    bytes /
    1024 /
    1024
  ).toFixed(
    bytes <
      10 *
        1024 *
        1024
      ? 1
      : 0,
  )} MB`;
}

function dateTime(
  value?:
    | string
    | null,
) {
  return value
    ? new Date(
        value,
      ).toLocaleString(
        "en-NG",
      )
    : "—";
}

function mediaMime(
  file: File,
) {
  if (file.type) {
    return file.type;
  }

  const name =
    file.name.toLowerCase();

  if (
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg")
  ) {
    return "image/jpeg";
  }

  if (
    name.endsWith(".png")
  ) {
    return "image/png";
  }

  if (
    name.endsWith(".webp")
  ) {
    return "image/webp";
  }

  if (
    name.endsWith(".mp4")
  ) {
    return "video/mp4";
  }

  if (
    name.endsWith(".webm")
  ) {
    return "video/webm";
  }

  return "";
}

function mediaValidationError(
  files: File[],
) {
  if (
    files.length >
    MAX_MEDIA_FILES
  ) {
    return "Attach a maximum of 6 media files.";
  }

  const total =
    files.reduce(
      (
        sum,
        file,
      ) =>
        sum +
        file.size,
      0,
    );

  if (
    total >
    MAX_MEDIA_TOTAL
  ) {
    return "Combined media must not exceed 50 MB.";
  }

  for (
    const file of files
  ) {
    const mime =
      mediaMime(file);

    if (
      [
        "image/jpeg",
        "image/png",
        "image/webp",
      ].includes(mime)
    ) {
      if (
        file.size >
        MAX_IMAGE_SIZE
      ) {
        return `${file.name}: images must be 5 MB or smaller.`;
      }

      continue;
    }

    if (
      [
        "video/mp4",
        "video/webm",
      ].includes(mime)
    ) {
      if (
        file.size >
        MAX_VIDEO_SIZE
      ) {
        return `${file.name}: videos must be 25 MB or smaller.`;
      }

      continue;
    }

    return `${file.name}: use JPG, PNG, WebP, MP4, or WebM.`;
  }

  return null;
}

function reportStatusLabel(
  report: Report,
) {
  const status =
    report.reviewstatus ??
    "Submitted";

  if (
    report.reporttype ===
    "Operations"
  ) {
    if (
      status === "Submitted"
    ) {
      return "Awaiting Project Manager review";
    }

    if (
      status === "Reviewed"
    ) {
      return "Approved by Project Manager";
    }
  }

  if (
    report.reporttype ===
    "Project Manager"
  ) {
    if (
      status === "Submitted"
    ) {
      return "Awaiting MD Office review";
    }

    if (
      status === "Authorized"
    ) {
      return "Authorized by MD Office";
    }
  }

  return status;
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
  const [
    reports,
    setReports,
  ] = useState<
    Report[]
  >([]);
  const [activeAttachment, setActiveAttachment] = useState<{
    title: string; url: string; kind: "pdf" | "image" | "video";
  } | null>(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    busy,
    setBusy,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState<
    string | null
  >(null);

  const [
    projectId,
    setProjectId,
  ] = useState(
    projects[0]
      ?.projectid ??
      "",
  );

  const [
    reportWeek,
    setReportWeek,
  ] = useState(
    currentWeekStart(),
  );

  const [reportDate, setReportDate] = useState(localDateValue(new Date()));
  const [revisionOf, setRevisionOf] = useState("");


  const [
    file,
    setFile,
  ] = useState<
    File | null
  >(null);

  const [
    mediaFiles,
    setMediaFiles,
  ] = useState<
    File[]
  >([]);
  const [supportingPdfs, setSupportingPdfs] = useState<File[]>([]);

  const [
    progressPct,
    setProgressPct,
  ] = useState("");

  const [
    query,
    setQuery,
  ] = useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState(
    "All statuses",
  );

  const [
    reportTypeFilter,
    setReportTypeFilter,
  ] = useState(
    "All report types",
  );

  const [
    reviewStatusFilter,
    setReviewStatusFilter,
  ] = useState(
    "All request statuses",
  );

  const [
    weekFilter,
    setWeekFilter,
  ] = useState(
    "All weeks",
  );

  const [
    fromDate,
    setFromDate,
  ] = useState("");

  const [
    toDate,
    setToDate,
  ] = useState("");

  const [
    reviewComments,
    setReviewComments,
  ] = useState<
    Record<
      number,
      string
    >
  >({});

  const [
    authorizeReasons,
    setAuthorizeReasons,
  ] = useState<
    Record<
      number,
      string
    >
  >({});

  const [
    authorizeRejecting,
    setAuthorizeRejecting,
  ] = useState<
    Record<
      number,
      boolean
    >
  >({});

  async function load() {
    setLoading(true);

    try {
      const response =
        await fetch(
          "/api/project-reports",
          {
            cache:
              "no-store",
          },
        );

      const body =
        await response.json();

      if (response.ok) {
        setReports(
          body,
        );
      } else {
        setMessage(
          body.error ??
            "Could not load Project Reports.",
        );
      }
    } catch (error) {
      setMessage(
        error instanceof
        Error
          ? error.message
          : "Could not load Project Reports.",
      );
    } finally {
      setLoading(
        false,
      );
    }
  }

  useEffect(() => {
    load();
  }, []);

  const selectedProject =
    useMemo(
      () =>
        projects.find(
          (project) =>
            project.projectid ===
            projectId,
        ),
      [
        projects,
        projectId,
      ],
    );

  const selectedIsManager =
    selectedProject
      ?.assignmentrole ===
    "Project Manager";

  const projectRoleById =
    useMemo(
      () =>
        new Map(
          projects.map(
            (project) => [
              project.projectid,
              project.assignmentrole,
            ],
          ),
        ),
      [projects],
    );

  const availableStatuses =
    useMemo(
      () =>
        [
          ...new Set(
            reports
              .map(
                (
                  report,
                ) =>
                  report
                    .projects
                    ?.status,
              )
              .filter(
                Boolean,
              ),
          ),
        ] as string[],
      [reports],
    );

  const availableWeeks =
    useMemo(
      () =>
        [
          ...new Set(
            reports.map(
              (report) =>
                report.reportweek,
            ),
          ),
        ],
      [reports],
    );

  const filteredReports =
    useMemo(() => {
      const normalized =
        query.toLowerCase();

      return reports.filter(
        (report) => {
          const clientName =
            report
              .projects
              ?.clients
              ?.fullnameorcompanyname ??
            "";

          const matchesSearch =
            [
              clientName,
              report
                .projects
                ?.projecttitle ??
                "",
              report.projectid,
              report.filename,
              report
                .users
                ?.fullname ??
                "",
              report
                .reviewer
                ?.fullname ??
                "",
              report
                .authorizer
                ?.fullname ??
                "",
              report.reporttype,
            ]
              .join(" ")
              .toLowerCase()
              .includes(
                normalized,
              );

          const matchesStatus =
            statusFilter ===
              "All statuses" ||
            report
              .projects
              ?.status ===
              statusFilter;

          const matchesType =
            reportTypeFilter ===
              "All report types" ||
            report.reporttype ===
              reportTypeFilter;

          const matchesWeek =
            weekFilter ===
              "All weeks" ||
            report.reportweek ===
              weekFilter;

          const matchesRequestStatus =
            reviewStatusFilter ===
              "All request statuses" ||
            (
              report.reviewstatus ??
              "Submitted"
            ) ===
              reviewStatusFilter;

          const uploadedDate =
            report.uploadedat.slice(
              0,
              10,
            );

          const matchesDateRange =
            (!fromDate ||
              uploadedDate >=
                fromDate) &&
            (!toDate ||
              uploadedDate <=
                toDate);

          return (
            matchesSearch &&
            matchesStatus &&
            matchesType &&
            matchesWeek &&
            matchesRequestStatus &&
            matchesDateRange
          );
        },
      );
    }, [
      reports,
      query,
      statusFilter,
      reportTypeFilter,
      reviewStatusFilter,
      weekFilter,
      fromDate,
      toDate,
    ]);

  const groupedReports =
    useMemo(() => {
      const groups =
        filteredReports.reduce<
          Record<
            string,
            Report[]
          >
        >(
          (
            acc,
            report,
          ) => {
            const client =
              report
                .projects
                ?.clients
                ?.fullnameorcompanyname ??
              "Client";

            const project =
              report
                .projects
                ?.projecttitle ??
              report.projectid;

            const status =
              report
                .projects
                ?.status ??
              "—";

            const key =
              `${client}|||${project}|||${status}`;

            if (
              !acc[key]
            ) {
              acc[key] =
                [];
            }

            acc[key].push(
              report,
            );

            return acc;
          },
          {},
        );

      Object.values(
        groups,
      ).forEach(
        (group) => {
          group.sort(
            (
              a,
              b,
            ) =>
              new Date(
                b.uploadedat,
              ).getTime() -
              new Date(
                a.uploadedat,
              ).getTime(),
          );
        },
      );

      return groups;
    }, [
      filteredReports,
    ]);

  const inboxReports = reports.filter((report) =>
    report.reviewstatus === "Submitted" &&
    ((canReview && report.reporttype === "Operations" &&
      projectRoleById.get(report.projectid) === "Project Manager") ||
     (canAuthorize && report.reporttype === "Project Manager"))
  );
  const reviewedInboxCount = reports.filter((report) =>
    ((canReview && report.reporttype === "Operations" &&
      projectRoleById.get(report.projectid) === "Project Manager" && report.reviewstatus === "Reviewed") ||
     (canAuthorize && report.reporttype === "Project Manager" && report.reviewstatus === "Authorized"))
  ).length;
  const rejectedInboxCount = reports.filter((report) =>
    report.reviewstatus === "Rejected" &&
    ((canReview && report.reporttype === "Operations" &&
      projectRoleById.get(report.projectid) === "Project Manager") ||
     (canAuthorize && report.reporttype === "Project Manager"))
  ).length;

  async function upload(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setMessage(null);

    if (
      !file ||
      !projectId
    ) {
      setMessage(
        "Select a project and PDF report.",
      );
      return;
    }

    if (
      file.type !==
        "application/pdf" ||
      !file.name
        .toLowerCase()
        .endsWith(".pdf")
    ) {
      setMessage(
        "Only PDF reports can be uploaded.",
      );
      return;
    }

    if (
      file.size >
      MAX_FILE_SIZE
    ) {
      setMessage(
        "The PDF must be 100 MB or smaller.",
      );
      return;
    }

    if (supportingPdfs.length > MAX_PDFS_PER_REPORT - 1) {
      setMessage("Select up to 7 supporting PDFs (8 PDFs total).");
      return;
    }
    for (const pdf of supportingPdfs) {
      if (!pdf.name.toLowerCase().endsWith(".pdf") || pdf.type !== "application/pdf" ||
          pdf.size < 1 || pdf.size > MAX_FILE_SIZE) {
        setMessage(`${pdf.name}: supporting PDFs must be 100 MB or smaller.`);
        return;
      }
    }

    if (
      selectedIsManager
    ) {
      const progress =
        Number(
          progressPct,
        );

      if (
        progressPct ===
          "" ||
        !Number.isFinite(
          progress,
        ) ||
        progress < 0 ||
        progress > 100
      ) {
        setMessage(
          "Project Manager Progress Reports require a progress percentage between 0 and 100.",
        );
        return;
      }
    }

    const mediaError =
      mediaValidationError(
        mediaFiles,
      );

    if (mediaError) {
      setMessage(
        mediaError,
      );
      return;
    }

    if (!selectedIsManager && !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
      setMessage("Select a valid daily reporting date.");
      return;
    }

    setBusy(true);

    let reportSaved =
      false;

    try {
      const request = {
        projectid:
          projectId,
        reportweek:
          selectedIsManager ? reportWeek : mondayFor(reportDate),
        reportdate: selectedIsManager ? null : reportDate,
        filename:
          file.name,
        filesize:
          file.size,
        mimetype:
          file.type,
      };

      const signedResponse =
        await fetch(
          "/api/project-reports/upload-url",
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify(
                request,
              ),
          },
        );

      const signedBody =
        await signedResponse.json();

      if (
        !signedResponse.ok
      ) {
        throw new Error(
          signedBody.error ??
            "Could not prepare report upload.",
        );
      }

      const {
        error:
          uploadError,
      } =
        await createClient()
          .storage
          .from(
            "project-reports",
          )
          .uploadToSignedUrl(
            signedBody.storagepath,
            signedBody.token,
            file,
            {
              contentType:
                "application/pdf",
            },
          );

      if (uploadError) {
        throw new Error(
          uploadError.message,
        );
      }

      const completeResponse =
        await fetch(
          "/api/project-reports/complete",
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify(
                {
                  ...request,
                  supersedesreportid: revisionOf ? Number(revisionOf) : null,
                  storagepath:
                    signedBody.storagepath,
                  progresspct:
                    selectedIsManager
                      ? Number(
                          progressPct,
                        )
                      : undefined,
                },
              ),
          },
        );

      const completeBody =
        await completeResponse.json();

      if (
        !completeResponse.ok
      ) {
        throw new Error(
          completeBody.error ??
            "Could not save report details.",
        );
      }

      reportSaved =
        true;

      let pdfsUploaded = 0;
      for (const pdf of supportingPdfs) {
        const pdfRequest = {
          reportid: completeBody.reportid,
          filename: pdf.name,
          filesize: pdf.size,
          mimetype: "application/pdf",
        };
        const signedPdfResponse = await fetch("/api/project-reports/pdfs/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pdfRequest),
        });
        const signedPdfBody = await signedPdfResponse.json();
        if (!signedPdfResponse.ok) {
          throw new Error(signedPdfBody.error ?? `Could not prepare ${pdf.name}`);
        }
        const { error: pdfUploadError } = await createClient().storage
          .from("project-reports")
          .uploadToSignedUrl(signedPdfBody.storagepath, signedPdfBody.token, pdf, {
            contentType: "application/pdf",
          });
        if (pdfUploadError) throw new Error(`${pdf.name}: ${pdfUploadError.message}`);
        const finishedPdfResponse = await fetch("/api/project-reports/pdfs/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...pdfRequest, storagepath: signedPdfBody.storagepath }),
        });
        const finishedPdfBody = await finishedPdfResponse.json();
        if (!finishedPdfResponse.ok) {
          throw new Error(finishedPdfBody.error ?? `Could not save ${pdf.name}`);
        }
        pdfsUploaded++;
      }

      let mediaUploaded =
        0;

      for (
        const media of
          mediaFiles
      ) {
        const mimetype =
          mediaMime(
            media,
          );

        const mediaRequest =
          {
            reportid:
              completeBody.reportid,
            filename:
              media.name,
            filesize:
              media.size,
            mimetype,
          };

        const mediaSignedResponse =
          await fetch(
            "/api/project-reports/media/upload-url",
            {
              method:
                "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body:
                JSON.stringify(
                  mediaRequest,
                ),
            },
          );

        const mediaSignedBody =
          await mediaSignedResponse.json();

        if (
          !mediaSignedResponse.ok
        ) {
          throw new Error(
            mediaSignedBody.error ??
              `Could not prepare ${media.name}.`,
          );
        }

        const {
          error:
            mediaUploadError,
        } =
          await createClient()
            .storage
            .from(
              "project-report-media",
            )
            .uploadToSignedUrl(
              mediaSignedBody.storagepath,
              mediaSignedBody.token,
              media,
              {
                contentType:
                  mimetype,
              },
            );

        if (
          mediaUploadError
        ) {
          throw new Error(
            `${media.name}: ${mediaUploadError.message}`,
          );
        }

        const mediaCompleteResponse =
          await fetch(
            "/api/project-reports/media/complete",
            {
              method:
                "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body:
                JSON.stringify(
                  {
                    ...mediaRequest,
                    storagepath:
                      mediaSignedBody.storagepath,
                  },
                ),
            },
          );

        const mediaCompleteBody =
          await mediaCompleteResponse.json();

        if (
          !mediaCompleteResponse.ok
        ) {
          throw new Error(
            mediaCompleteBody.error ??
              `Could not save ${media.name}.`,
          );
        }

        mediaUploaded++;
      }

      setFile(null);
      setSupportingPdfs([]);
      setMediaFiles([]);
      setProgressPct("");

      const reportInput =
        document.getElementById(
          "project-report-file",
        ) as HTMLInputElement | null;

      if (reportInput) {
        reportInput.value =
          "";
      }

      const supportingInput = document.getElementById(
        "project-report-supporting-pdfs",
      ) as HTMLInputElement | null;
      if (supportingInput) supportingInput.value = "";

      const mediaInput =
        document.getElementById(
          "project-report-media",
        ) as HTMLInputElement | null;

      if (mediaInput) {
        mediaInput.value =
          "";
      }

      setMessage(
        `${completeBody.emailMessage}${pdfsUploaded ? ` ${pdfsUploaded} supporting PDF(s) attached.` : ""}${
          mediaUploaded
            ? ` ${mediaUploaded} media file${
                mediaUploaded ===
                1
                  ? ""
                  : "s"
              } attached.`
            : ""
        }`,
      );

      setRevisionOf("");
      await load();
    } catch (error) {
      const detail =
        error instanceof
        Error
          ? error.message
          : "Upload failed.";

      setMessage(
        reportSaved
          ? `The primary report was saved, but a supporting PDF or media upload did not complete: ${detail}. Contact an administrator before approval if attachments are missing.`
          : detail,
      );

      if (reportSaved) {
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function reviewReport(
    report: Report,
    decision:
      | "Reviewed"
      | "Rejected",
  ) {
    const comments =
      reviewComments[
        report.reportid
      ] ?? "";

    if (
      decision ===
        "Rejected" &&
      !comments.trim()
    ) {
      setMessage(
        "Enter why the report was rejected and exactly what must be corrected.",
      );
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const response =
        await fetch(
          `/api/project-reports/${report.reportid}/review`,
          {
            method:
              "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify(
                {
                  decision,
                  comments,
                },
              ),
          },
        );

      const body =
        await response.json();

      if (
        !response.ok
      ) {
        throw new Error(
          body.error ??
            "Could not review report.",
        );
      }

      setMessage(
        decision ===
          "Reviewed"
          ? body.message ??
            "Operations Report approved by the Project Manager."
          : body.emailSent
            ? "Operations Report rejected and the uploader notified by email."
            : `Operations Report rejected. The uploader could not be emailed — ${
                body.emailError ??
                "verify Resend setup."
              }`,
      );

      await load();
    } catch (error) {
      setMessage(
        error instanceof
        Error
          ? error.message
          : "Could not review report.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function authorizeReport(
    report: Report,
    decision:
      | "Authorized"
      | "Rejected",
  ) {
    const reason =
      authorizeReasons[
        report.reportid
      ] ?? "";

    if (
      decision ===
        "Rejected" &&
      !reason.trim()
    ) {
      setMessage(
        "Enter why the report was rejected and exactly what must be corrected.",
      );
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const response =
        await fetch(
          `/api/project-reports/${report.reportid}/authorize`,
          {
            method:
              "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify(
                {
                  decision,
                  comments:
                    decision ===
                    "Rejected"
                      ? reason
                      : undefined,
                },
              ),
          },
        );

      const body =
        await response.json();

      if (
        !response.ok
      ) {
        throw new Error(
          body.error ??
            "Could not review Project Manager Progress Report.",
        );
      }

      setMessage(
        decision ===
          "Authorized"
          ? body.emailSent
            ? "Project Manager Progress Report authorized and the client notified."
            : `Progress Report authorized. The client could not be emailed — ${
                body.emailError ??
                "verify Resend setup."
              }`
          : body.emailSent
            ? "Project Manager Progress Report rejected and the uploader notified by email."
            : `Progress Report rejected. The uploader could not be emailed — ${
                body.emailError ??
                "verify Resend setup."
              }`,
      );

      setAuthorizeRejecting(
        (prev) => ({
          ...prev,
          [report.reportid]:
            false,
        }),
      );

      setAuthorizeReasons(
        (prev) => ({
          ...prev,
          [report.reportid]:
            "",
        }),
      );

      await load();
    } catch (error) {
      setMessage(
        error instanceof
        Error
          ? error.message
          : "Could not review Project Manager Progress Report.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-7 space-y-6">
      {(canReview || canAuthorize) && (
        <section className="card p-5" id="report-inbox">
          <h2 className="text-lg font-semibold">{canAuthorize ? "MD Office — Report Inbox" : "Project Manager — Report Inbox"}</h2>
          <p className="mt-1 text-sm text-slate-500">New submissions awaiting your review. Open a report below to review the attachments and approve or reject it.</p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <span className="rounded bg-amber-50 px-3 py-2 text-amber-900">Pending: {inboxReports.length}</span>
            <span className="rounded bg-green-50 px-3 py-2 text-green-900">Approved: {reviewedInboxCount}</span>
            <span className="rounded bg-red-50 px-3 py-2 text-red-900">Rejected: {rejectedInboxCount}</span>
          </div>
          <div className="mt-4 divide-y">
            {inboxReports.length === 0 ? <p className="py-3 text-sm text-slate-500">No pending reports.</p> : inboxReports.map((report) => (
              <div key={report.reportid} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div><p className="font-semibold">{report.projects?.projecttitle ?? report.projectid}</p>
                  <p className="text-slate-500">{report.users?.fullname ?? "Staff member"} · {report.reportdate ?? report.reportweek} · {report.filename}</p></div>
                <button type="button" className="rounded bg-navy px-3 py-2 text-white"
                  onClick={() => {setQuery(report.filename); setReviewStatusFilter("Submitted"); document.getElementById("report-list")?.scrollIntoView({behavior:"smooth"});}}>
                  Open for review
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      {canUpload && (

        <section className="card p-5 md:p-6">
          <h2 className="text-base font-semibold">
            {selectedIsManager
              ? "Upload Project Manager Progress Report"
              : "Upload Operations Report"}
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Project Managers submit weekly reports; all other assigned team members (including QS) submit daily reports. PDF maximum 100 MB. Supporting images: JPG/PNG/WebP up to 5 MB each. Videos: MP4/WebM up to 25 MB each. Maximum 6 media files and 50 MB combined per report.
          </p>

          <p className="mt-1 text-sm text-slate-500">
            {selectedIsManager
              ? "Project Manager Progress Reports require a progress percentage and go directly to MD Office. Only authorized PM reports become client-facing."
              : "Operations Reports go to the approved Project Manager for review and do not update the client progress percentage."}
          </p>

          {reports.some((report) => report.reviewstatus === "Rejected" && report.projectid === projectId) && (
            <label className="mt-4 block">
              <span className="field-label">Resubmit a rejected report (optional)</span>
              <select className="field-input" value={revisionOf} onChange={(event) => setRevisionOf(event.target.value)}>
                <option value="">New report (not a revision)</option>
                {reports.filter((report) => report.reviewstatus === "Rejected" && report.projectid === projectId).map((report) => (
                  <option key={report.reportid} value={report.reportid}>#{report.reportid} — {report.filename} ({report.reportdate ?? report.reportweek})</option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-500">Upload corrected PDF(s). Previous rejected submissions and feedback stay in the record.</span>
            </label>
          )}
          <form
            className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5"
            onSubmit={upload}
          >
            <label>
              <span className="field-label">
                Client / Project
              </span>

              <select
                className="field-input"
                value={
                  projectId
                }
                onChange={(
                  event,
                ) => {
                  setProjectId(
                    event.target.value,
                  );
                  setProgressPct(
                    "",
                  );
                }}
                required
              >
                <option value="">
                  Select project…
                </option>

                {projects.map(
                  (project) => (
                    <option
                      key={
                        project.projectid
                      }
                      value={
                        project.projectid
                      }
                    >
                      {project
                        .clients
                        ?.fullnameorcompanyname ??
                        "Client"}{" "}
                      ·{" "}
                      {
                        project.projecttitle
                      }{" "}
                      ·{" "}
                      {
                        project.assignmentrole
                      }
                    </option>
                  ),
                )}
              </select>
            </label>

            {selectedIsManager ? <label>
              <span className="field-label">
                Reporting week
              </span>

              <input
                className="field-input"
                type="date"
                max={localDateValue(
                  new Date(),
                )}
                value={
                  reportWeek
                }
                onChange={(
                  event,
                ) =>
                  setReportWeek(
                    mondayFor(
                      event
                        .target
                        .value,
                    ),
                  )
                }
                required
              />
            </label> : <label>
              <span className="field-label">Reporting date (DD/MM/YYYY)</span>
              <input className="field-input" type="date" value={reportDate} max={localDateValue(new Date())} onChange={(event) => setReportDate(event.target.value)} required />
            </label>}

            {selectedIsManager && (
              <label>
                <span className="field-label">
                  Project progress %
                </span>

                <input
                  className="field-input"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={
                    progressPct
                  }
                  onChange={(
                    event,
                  ) =>
                    setProgressPct(
                      event
                        .target
                        .value,
                    )
                  }
                  placeholder="0–100"
                  required
                />
              </label>
            )}

            <label>
              <span className="field-label">
                Primary PDF file
              </span>

              <input
                id="project-report-file"
                className="field-input pt-2"
                type="file"
                accept="application/pdf,.pdf"
                onChange={(
                  event,
                ) =>
                  setFile(
                    event
                      .target
                      .files?.[0] ??
                      null,
                  )
                }
                required
              />
            </label>

            <label>
              <span className="field-label">Supporting PDFs (optional, up to 7)</span>
              <input
                id="project-report-supporting-pdfs"
                className="field-input pt-2"
                type="file"
                accept="application/pdf,.pdf"
                multiple
                onChange={(event) => {
                  const selected = Array.from(event.currentTarget.files ?? []);
                  if (selected.length > MAX_PDFS_PER_REPORT - 1 ||
                      selected.some((pdf) => !pdf.name.toLowerCase().endsWith(".pdf") ||
                        pdf.type !== "application/pdf" || pdf.size < 1 || pdf.size > MAX_FILE_SIZE)) {
                    setMessage("Choose up to 7 supporting PDFs, each no larger than 100 MB.");
                    setSupportingPdfs([]);
                    event.currentTarget.value = "";
                    return;
                  }
                  setSupportingPdfs(selected);
                  setMessage(null);
                }}
              />
              {supportingPdfs.length > 0 && (
                <span className="mt-1 block text-xs text-slate-500">
                  {supportingPdfs.length} supporting PDF(s) selected
                </span>
              )}
            </label>

            <label>
              <span className="field-label">
                Pictures / videos
              </span>

              <input
                id="project-report-media"
                className="field-input pt-2"
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,.jpg,.jpeg,.png,.webp,.mp4,.webm"
                onChange={(
                  event,
                ) => {
                  const selected =
                    Array.from(
                      event
                        .target
                        .files ??
                        [],
                    );

                  const error =
                    mediaValidationError(
                      selected,
                    );

                  if (error) {
                    setMessage(
                      error,
                    );
                    event.currentTarget.value =
                      "";
                    setMediaFiles(
                      [],
                    );
                    return;
                  }

                  setMediaFiles(
                    selected,
                  );
                }}
              />
            </label>

            <div className="flex items-end xl:col-span-5">
              <button
                type="submit"
                className="btn-primary w-full md:w-auto"
                disabled={
                  busy ||
                  !selectedProject
                }
              >
                {busy
                  ? "Uploading…"
                  : selectedIsManager
                    ? "Submit Progress Report"
                    : "Submit Operations Report"}
              </button>

              {mediaFiles.length >
                0 && (
                <span className="ml-3 text-sm text-slate-500">
                  {
                    mediaFiles.length
                  }{" "}
                  media file
                  {mediaFiles.length ===
                  1
                    ? ""
                    : "s"}{" "}
                  selected
                </span>
              )}
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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            className="field-input"
            value={query}
            onChange={(
              event,
            ) =>
              setQuery(
                event
                  .target
                  .value,
              )
            }
            placeholder="Search client, project, code, file or staff…"
          />

          <select
            className="field-input"
            value={
              statusFilter
            }
            onChange={(
              event,
            ) =>
              setStatusFilter(
                event
                  .target
                  .value,
              )
            }
          >
            <option>
              All statuses
            </option>

            {availableStatuses.map(
              (status) => (
                <option
                  key={
                    status
                  }
                  value={
                    status
                  }
                >
                  {status}
                </option>
              ),
            )}
          </select>

          <select
            className="field-input"
            value={
              reportTypeFilter
            }
            onChange={(
              event,
            ) =>
              setReportTypeFilter(
                event
                  .target
                  .value,
              )
            }
          >
            <option>
              All report types
            </option>
            <option>
              Operations
            </option>
            <option>
              Project Manager
            </option>
          </select>

          <select
            className="field-input"
            value={
              reviewStatusFilter
            }
            onChange={(
              event,
            ) =>
              setReviewStatusFilter(
                event
                  .target
                  .value,
              )
            }
          >
            <option>
              All request statuses
            </option>
            <option>
              Submitted
            </option>
            <option>
              Reviewed
            </option>
            <option>
              Authorized
            </option>
            <option>
              Rejected
            </option>
          </select>

          <select
            className="field-input"
            value={
              weekFilter
            }
            onChange={(
              event,
            ) =>
              setWeekFilter(
                event
                  .target
                  .value,
              )
            }
          >
            <option>
              All weeks
            </option>

            {availableWeeks.map(
              (value) => (
                <option
                  key={
                    value
                  }
                  value={
                    value
                  }
                >
                  {weekLabel(
                    value,
                  )}
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
              value={
                fromDate
              }
              onChange={(
                event,
              ) =>
                setFromDate(
                  event
                    .target
                    .value,
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
              value={
                toDate
              }
              onChange={(
                event,
              ) =>
                setToDate(
                  event
                    .target
                    .value,
                )
              }
            />
          </label>
        </div>
      </section>

      <section className="space-y-5" id="report-list">
        {Object.entries(
          groupedReports,
        ).map(
          ([
            key,
            group,
          ]) => {
            const [
              clientName,
              projectName,
              projectStatus,
            ] =
              key.split(
                "|||",
              );

            return (
              <article
                key={
                  key
                }
                className="card overflow-hidden"
              >
                <header className="grid gap-3 border-b bg-slate-50 px-5 py-4 md:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Client
                    </p>

                    <p className="mt-1 font-semibold">
                      {
                        clientName
                      }
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Project
                    </p>

                    <p className="mt-1 font-semibold">
                      {
                        projectName
                      }
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Project status
                    </p>

                    <p className="mt-1 font-semibold">
                      {
                        projectStatus
                      }
                    </p>
                  </div>
                </header>

                <div className="divide-y divide-slate-100">
                  {group.map(
                    (
                      report,
                    ) => {
                      const role =
                        projectRoleById.get(
                          report.projectid,
                        );

                      const canReviewThis =
                        canReview &&
                        role ===
                          "Project Manager" &&
                        report.reporttype ===
                          "Operations" &&
                        (
                          report.reviewstatus ??
                          "Submitted"
                        ) ===
                          "Submitted";

                      const canAuthorizeThis =
                        canAuthorize &&
                        report.reporttype ===
                          "Project Manager" &&
                        [
                          "Submitted",
                          "Reviewed",
                        ].includes(
                          report.reviewstatus ??
                            "Submitted",
                        );

                      const isRejectingAuthorize =
                        authorizeRejecting[
                          report.reportid
                        ] ??
                        false;

                      const media =
                        report.projectreportmedia ??
                        [];

                      const pdfs = report.projectreportpdfs ?? [];

                      return (
                        <div
                          key={
                            report.reportid
                          }
                          className="p-5"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold">
                                  {
                                    report.filename
                                  }
                                </p>

                                <span className="badge-neutral">
                                  {
                                    report.reporttype
                                  }
                                </span>
                              </div>

                              <p className="mt-1 text-sm text-slate-500">
                                Week of{" "}
                                {report.reportdate ? new Date(`${report.reportdate}T12:00:00`).toLocaleDateString("en-GB") : weekLabel(report.reportweek)}{" "}
                                ·{" "}
                                {sizeLabel(
                                  Number(
                                    report.filesize,
                                  ),
                                )}
                              </p>

                              <p className="mt-1 text-xs text-slate-400">
                                Uploaded by{" "}
                                {report
                                  .users
                                  ?.fullname ??
                                  "Operations"}{" "}
                                ·{" "}
                                {dateTime(
                                  report.uploadedat,
                                )}
                              </p>
                            </div>

                            <button type="button" className="font-medium text-navy hover:underline"
                              onClick={() => setActiveAttachment({ title: report.filename, url: `/api/project-reports/download/${report.reportid}`, kind: "pdf" })}>
                              View / download PDF
                            </button>
                          </div>

                          {pdfs.length > 0 && (
                            <div className="mt-4 rounded-md border border-slate-200 p-4">
                              <p className="font-medium">Supporting PDFs ({pdfs.length})</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {pdfs.map((pdf) => (
                                  <button type="button" key={pdf.pdfid}
                                    onClick={() => setActiveAttachment({ title: pdf.filename, url: `/api/project-reports/pdfs/${pdf.pdfid}`, kind: "pdf" })}
                                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-navy hover:bg-slate-50">
                                    PDF: {pdf.filename} · {sizeLabel(Number(pdf.filesize))}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="mt-4 grid gap-3 rounded-md bg-slate-50 p-4 text-sm md:grid-cols-4">
                            <div>
                              <p className="text-xs uppercase text-slate-400">
                                Status
                              </p>

                              <p className="mt-1 font-medium">
                                {reportStatusLabel(
                                  report,
                                )}
                              </p>
                            </div>

                            <div>
                              <p className="text-xs uppercase text-slate-400">
                                Report route
                              </p>

                              <p className="mt-1">
                                {report.reporttype ===
                                "Project Manager"
                                  ? "MD Office"
                                  : "Project Manager"}
                              </p>
                            </div>

                            <div>
                              <p className="text-xs uppercase text-slate-400">
                                Project progress
                              </p>

                              <p className="mt-1">
                                {report.reporttype ===
                                  "Project Manager" &&
                                report.progresspct !==
                                  null &&
                                report.progresspct !==
                                  undefined
                                  ? `${report.progresspct}%`
                                  : "—"}
                              </p>
                            </div>

                            <div>
                              <p className="text-xs uppercase text-slate-400">
                                Supporting media
                              </p>

                              <p className="mt-1">
                                {
                                  media.length
                                }{" "}
                                file
                                {media.length ===
                                1
                                  ? ""
                                  : "s"}
                              </p>
                            </div>
                          </div>

                          {report.reporttype ===
                            "Operations" && (
                            <div className="mt-3 text-sm text-slate-500">
                              <span className="font-medium text-slate-700">
                                Project Manager review:
                              </span>{" "}
                              {report.supervisorreviewedat
                                ? `${
                                    report
                                      .reviewer
                                      ?.fullname ??
                                    "Project Manager"
                                  } · ${dateTime(
                                    report.supervisorreviewedat,
                                  )}`
                                : "Awaiting review"}

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
                          )}

                          {report.reporttype ===
                            "Project Manager" && (
                            <div className="mt-3 text-sm text-slate-500">
                              <span className="font-medium text-slate-700">
                                MD Office review:
                              </span>{" "}
                              {report.authorizedat
                                ? `${
                                    report
                                      .authorizer
                                      ?.fullname ??
                                    "MD Office"
                                  } · ${dateTime(
                                    report.authorizedat,
                                  )}`
                                : "Awaiting review"}

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
                          )}

                          {media.length >
                            0 && (
                            <div className="mt-4 rounded-md border border-slate-200 p-4">
                              <p className="font-medium">
                                Pictures / videos
                              </p>

                              <div className="mt-3 flex flex-wrap gap-2">
                                {media.map(
                                  (
                                    item,
                                  ) => (
                                    <button type="button" key={item.mediaid}
                                      onClick={() => setActiveAttachment({ title: item.filename, url: `/api/project-reports/media/${item.mediaid}`, kind: item.mediatype === "Video" ? "video" : "image" })}
                                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-navy hover:bg-slate-50">
                                      {item.mediatype}: {item.filename} · {sizeLabel(Number(item.filesize))}
                                    </button>
                                  ),
                                )}
                              </div>
                            </div>
                          )}

                          {canReviewThis && (
                            <div className="mt-4 rounded-md border border-slate-200 p-4">
                              <p className="font-medium">
                                Project Manager review
                              </p>

                              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto]">
                                <input
                                  className="field-input"
                                  placeholder="Review comments (required to reject)"
                                  value={
                                    reviewComments[
                                      report.reportid
                                    ] ??
                                    ""
                                  }
                                  onChange={(
                                    event,
                                  ) =>
                                    setReviewComments(
                                      (
                                        prev,
                                      ) => ({
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
                                  disabled={
                                    busy
                                  }
                                  onClick={() =>
                                    reviewReport(
                                      report,
                                      "Reviewed",
                                    )
                                  }
                                >
                                  Approve report
                                </button>

                                <button
                                  type="button"
                                  className="btn-secondary"
                                  disabled={
                                    busy
                                  }
                                  onClick={() =>
                                    reviewReport(
                                      report,
                                      "Rejected",
                                    )
                                  }
                                >
                                  Reject report
                                </button>
                              </div>
                            </div>
                          )}

                          {canAuthorizeThis && (
                            <div className="mt-4">
                              {isRejectingAuthorize ? (
                                <div className="rounded-md border border-slate-200 p-4">
                                  <p className="font-medium">
                                    Reject Project Manager Progress Report
                                  </p>

                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <input
                                      className="field-input max-w-sm"
                                      placeholder="Reason for rejection (required)"
                                      value={
                                        authorizeReasons[
                                          report.reportid
                                        ] ??
                                        ""
                                      }
                                      onChange={(
                                        event,
                                      ) =>
                                        setAuthorizeReasons(
                                          (
                                            prev,
                                          ) => ({
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
                                      disabled={
                                        busy
                                      }
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
                                          (
                                            prev,
                                          ) => ({
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
                                    disabled={
                                      busy
                                    }
                                    onClick={() =>
                                      authorizeReport(
                                        report,
                                        "Authorized",
                                      )
                                    }
                                  >
                                    Authorize Progress Report
                                  </button>

                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    disabled={
                                      busy
                                    }
                                    onClick={() =>
                                      setAuthorizeRejecting(
                                        (
                                          prev,
                                        ) => ({
                                          ...prev,
                                          [report.reportid]:
                                            true,
                                        }),
                                      )
                                    }
                                  >
                                    Reject Progress Report
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    },
                  )}
                </div>
              </article>
            );
          },
        )}

        {!loading &&
          !filteredReports.length && (
            <div className="card p-10 text-center text-slate-400">
              No Project Reports match the selected filters.
            </div>
          )}

        {loading && (
          <p className="text-center text-slate-400">
            Loading Project Reports…
          </p>
        )}
      </section>
      <ReportAttachmentViewer attachment={activeAttachment} onClose={() => setActiveAttachment(null)} />
    </div>
  );
}
