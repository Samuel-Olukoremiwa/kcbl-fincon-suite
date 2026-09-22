import type { Viewer } from "@/lib/viewer";

export const STAFF_DOCUMENT_BUCKET = "staff-documents";
export const MAX_STAFF_DOCUMENT_BYTES = 20 * 1024 * 1024;

export const STAFF_DOCUMENT_TYPES = [
  "Updated CV",
  "Passport Photograph",
  "Valid Means of Identification",
  "Educational Certificate",
  "Professional Certificate / Licence",
  "Employment Letter",
  "Medical Result",
  "Signed Onboarding Form",
  "Other",
] as const;

export const STAFF_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export function canViewStaffRecord(viewer: Viewer) {
  return (
    viewer.userType === "Staff" &&
    (viewer.roleName === "Super User" ||
      ["Business Development", "MD Office"].includes(
        viewer.department ?? "",
      ))
  );
}

export function canEditStaffOnboarding(viewer: Viewer) {
  return (
    viewer.userType === "Staff" &&
    (viewer.roleName === "Super User" ||
      ["Business Development", "MD Office"].includes(
        viewer.department ?? "",
      ))
  );
}

export function canViewSensitiveStaffData(viewer: Viewer) {
  return (
    viewer.userType === "Staff" &&
    (viewer.roleName === "Super User" || viewer.department === "MD Office")
  );
}

export function canEditSensitiveStaffData(viewer: Viewer) {
  return canViewSensitiveStaffData(viewer);
}

export function canVerifyStaffOnboarding(viewer: Viewer) {
  return (
    viewer.userType === "Staff" &&
    (viewer.roleName === "Super User" ||
      (viewer.department === "MD Office" &&
        ["Authorizer", "MD Office"].includes(viewer.roleName)))
  );
}

export function maskAccountNumber(value?: string | null) {
  if (!value) return "";
  if (value.length <= 4) return value;
  return `${"•".repeat(Math.max(value.length - 4, 4))}${value.slice(-4)}`;
}