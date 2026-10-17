import type { Viewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccess } from "@/lib/access";

export const REPORT_BUCKET = "project-reports";
export const MEDIA_BUCKET = "project-report-media";

export const MAX_REPORT_BYTES =
  100 * 1024 * 1024;

export const MAX_IMAGE_BYTES =
  5 * 1024 * 1024;

export const MAX_VIDEO_BYTES =
  25 * 1024 * 1024;

export const MAX_MEDIA_FILES = 6;

export const MAX_MEDIA_TOTAL_BYTES =
  50 * 1024 * 1024;

export type ProjectReportType =
  | "Operations"
  | "Project Manager";

export type ProjectReportMediaType =
  | "Image"
  | "Video";

type ReadableProjectReport = {
  projectid: string;
  uploadedbyuserid?: string | null;
  reporttype?: string | null;
  reviewstatus?: string | null;
};

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
]);

export function validReportWeek(
  value: unknown,
) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const parsed = new Date(
    `${value}T00:00:00Z`,
  );

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCDay() === 1
  );
}

export function reportTypeForAssignmentRole(
  assignmentRole: string,
): ProjectReportType {
  return assignmentRole ===
    "Project Manager"
    ? "Project Manager"
    : "Operations";
}

export function mediaTypeForMime(
  mimetype: string,
): ProjectReportMediaType | null {
  if (IMAGE_MIME_TYPES.has(mimetype)) {
    return "Image";
  }

  if (VIDEO_MIME_TYPES.has(mimetype)) {
    return "Video";
  }

  return null;
}

export function validMediaUpload({
  mimetype,
  filesize,
}: {
  mimetype: unknown;
  filesize: unknown;
}) {
  if (
    typeof mimetype !== "string" ||
    !Number.isInteger(filesize) ||
    Number(filesize) < 1
  ) {
    return false;
  }

  const mediaType =
    mediaTypeForMime(mimetype);

  if (!mediaType) {
    return false;
  }

  if (
    mediaType === "Image" &&
    Number(filesize) > MAX_IMAGE_BYTES
  ) {
    return false;
  }

  if (
    mediaType === "Video" &&
    Number(filesize) > MAX_VIDEO_BYTES
  ) {
    return false;
  }

  return true;
}

export async function getApprovedAssignmentRole(
  viewer: Viewer,
  projectId: string,
) {
  if (
    viewer.userType !== "Staff" ||
    viewer.department !== "Operations"
  ) {
    return null;
  }

  const admin = createAdminClient();

  const {
    data,
    error,
  } = await admin
    .from("projectassignments")
    .select("assignmentrole")
    .eq("projectid", projectId)
    .eq("userid", viewer.userId)
    .eq("approvalstatus", "Approved")
    .eq("active", true);

  if (error || !data?.length) {
    return null;
  }

  const manager = data.find(
    (row) =>
      row.assignmentrole ===
      "Project Manager",
  );

  return (
    manager?.assignmentrole ??
    data[0].assignmentrole
  );
}

export async function canReadProjectReport(
  viewer: Viewer,
  report: ReadableProjectReport,
) {
  if (viewer.roleName === "Super User") {
    return true;
  }

  const admin = createAdminClient();

  if (viewer.userType === "Client") {
    if (
      report.reporttype !==
        "Project Manager" ||
      report.reviewstatus !==
        "Authorized"
    ) {
      return false;
    }

    const {
      data: client,
    } = await admin
      .from("clients")
      .select("clientid")
      .eq(
        "linkeduserid",
        viewer.userId,
      )
      .maybeSingle();

    if (!client) {
      return false;
    }

    const {
      data: project,
    } = await admin
      .from("projects")
      .select("projectid")
      .eq(
        "projectid",
        report.projectid,
      )
      .eq(
        "clientid",
        client.clientid,
      )
      .maybeSingle();

    return Boolean(project);
  }

  if (viewer.userType !== "Staff") {
    return false;
  }

  if (
    viewer.department === "Operations"
  ) {
    const role =
      await getApprovedAssignmentRole(
        viewer,
        report.projectid,
      );

    if (!role) {
      return false;
    }

    if (
      role === "Project Manager"
    ) {
      return true;
    }

    return (
      report.uploadedbyuserid ===
      viewer.userId
    );
  }

  return canAccess(
    viewer,
    "reports",
  );
}
