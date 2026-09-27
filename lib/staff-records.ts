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

export const STAFF_TYPES = [
  "Permanent",
  "Intern",
  "NYSC",
  "Temporary Staff",
] as const;

export const TEMPORARY_STAFF_TYPES = [
  "Intern",
  "NYSC",
  "Temporary Staff",
] as const;

export type StaffType = (typeof STAFF_TYPES)[number];

export type StaffOnboardingStatus =
  | "Draft"
  | "Submitted"
  | "Verified"
  | "Account Created";

export function isStaffType(value: unknown): value is StaffType {
  return (
    typeof value === "string" &&
    (STAFF_TYPES as readonly string[]).includes(value)
  );
}

export function isTemporaryStaffType(value: unknown) {
  return (
    typeof value === "string" &&
    (TEMPORARY_STAFF_TYPES as readonly string[]).includes(value)
  );
}

export function validDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function todayInLagos() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";

  return `${year}-${month}-${day}`;
}

/**
 * The selected expiry date is the staff member's LAST valid access date.
 * Access is blocked from the next Africa/Lagos calendar day.
 *
 * Temporary staff with no expiry date are treated as expired (fail closed).
 */
export function isStaffAccessExpired(
  staffType: unknown,
  accessExpiryDate: unknown,
  today = todayInLagos(),
) {
  if (!isTemporaryStaffType(staffType)) {
    return false;
  }

  if (!validDateOnly(accessExpiryDate)) {
    return true;
  }

  return today > accessExpiryDate;
}

export function validateStaffAccessWindow({
  staffType,
  accessExpiryDate,
  requireCurrentOrFuture = false,
}: {
  staffType: unknown;
  accessExpiryDate: unknown;
  requireCurrentOrFuture?: boolean;
}) {
  if (!isStaffType(staffType)) {
    return "Select a valid staff type.";
  }

  if (staffType === "Permanent") {
    return null;
  }

  if (!validDateOnly(accessExpiryDate)) {
    return `${staffType} staff must have a valid Access Expiry Date.`;
  }

  if (requireCurrentOrFuture && accessExpiryDate < todayInLagos()) {
    return "Access Expiry Date cannot be in the past.";
  }

  return null;
}

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
