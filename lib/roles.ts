export const STANDARD_STAFF_ROLES = [
  "Initiator",
  "Authorizer",
] as const;

export const SUPER_USER_ROLE = "Super User" as const;
export const CLIENT_ROLE = "Client" as const;

export const ASSIGNABLE_STAFF_ROLES = [
  ...STANDARD_STAFF_ROLES,
  SUPER_USER_ROLE,
] as const;

export const STAFF_DEPARTMENTS = [
  "MD",
  "MD Office",
  "Executive Director",
  "Non-Executive Director",
  "Finance & Admin",
  "Business Development",
  "Operations",
  "Audit/Internal Control",
] as const;

export type AccessLevel = "Read & Write" | "Read Only";

export function isAssignableStaffRole(roleName: string) {
  return (ASSIGNABLE_STAFF_ROLES as readonly string[]).includes(roleName);
}

export function isStaffDepartment(department: string) {
  return (STAFF_DEPARTMENTS as readonly string[]).includes(department);
}

/**
 * Access level is system-managed. It is intentionally not a user-selectable
 * permission because actual permissions are determined by Department + Role.
 */
export function deriveAccessLevel({
  userType,
  roleName,
  storedAccessLevel,
}: {
  userType: "Staff" | "Client";
  roleName: string;
  storedAccessLevel?: string | null;
}): AccessLevel {
  if (userType === "Client" || roleName === CLIENT_ROLE) {
    return "Read Only";
  }

  if (isAssignableStaffRole(roleName)) {
    return "Read & Write";
  }

  // Transitional fallback for legacy staff accounts whose old role name is
  // still stored in the database. New assignments cannot use those roles.
  return storedAccessLevel === "Read & Write" ? "Read & Write" : "Read Only";
}