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

export type StaffOnboardingStatus =
  | "Draft"
  | "Submitted"
  | "Verified"
  | "Account Created";

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

/**
 * Creating a FinCon Suite login is deliberately separate from personnel
 * onboarding. Business Development can create normal staff accounts after a
 * verified onboarding record exists. A Super User can do the same and is the
 * only person who may assign the Super User role.
 */
export function canCreateStaffSystemAccount(viewer: Viewer) {
  return (
    viewer.userType === "Staff" &&
    (viewer.roleName === "Super User" ||
      viewer.department === "Business Development")
  );
}

export function maskAccountNumber(value?: string | null) {
  if (!value) return "";
  if (value.length <= 4) return value;
  return `${"•".repeat(Math.max(value.length - 4, 4))}${value.slice(-4)}`;
}
