import type { Viewer } from "@/lib/viewer";

export type ModuleKey =
  | "dashboard"
  | "users"
  | "clients"
  | "projects"
  | "suppliers"
  | "subcontractors"
  | "transactions"
  | "audit"
  | "maintenance"
  | "settings"
  | "editRequests"
  | "reports"
  | "assignments";

type Rule = { modules: ModuleKey[]; write: ModuleKey[] };

// Department controls which parts of the system a staff member can access.
// Role controls workflow actions inside those modules (Initiator vs
// Authorizer). Access level is derived automatically and is not selected by
// the user.
const departmentMatrix: Record<string, Rule> = {
  MD: {
    modules: [
      "dashboard",
      "clients",
      "projects",
      "suppliers",
      "subcontractors",
      "transactions",
      "audit",
    ],
    write: [],
  },
  "MD Office": {
    modules: [
      "users",
      "clients",
      "projects",
      "suppliers",
      "subcontractors",
      "transactions",
      "audit",
      "editRequests",
      "reports",
      "assignments",
    ],
    write: [
      "clients",
      "projects",
      "suppliers",
      "subcontractors",
      "editRequests",
      "reports",
      "assignments",
    ],
  },
  "Executive Director": { modules: ["dashboard", "audit"], write: [] },
  "Non-Executive Director": { modules: ["dashboard"], write: [] },
  "Finance & Admin": {
    modules: ["suppliers", "subcontractors", "transactions", "editRequests"],
    write: ["suppliers", "subcontractors", "transactions", "editRequests"],
  },
  "Business Development": {
    modules: ["users", "clients", "projects", "editRequests"],
    write: ["users", "clients", "projects", "editRequests"],
  },
  Operations: {
    modules: ["reports", "assignments"],
    write: ["reports", "assignments"],
  },
  "Audit/Internal Control": {
    modules: [
      "clients",
      "projects",
      "suppliers",
      "subcontractors",
      "transactions",
      "audit",
      "editRequests",
      "settings",
    ],
    write: [],
  },
};

const superUserRule: Rule = {
  modules: [
    "dashboard",
    "users",
    "clients",
    "projects",
    "suppliers",
    "subcontractors",
    "transactions",
    "audit",
    "maintenance",
    "settings",
    "editRequests",
    "reports",
    "assignments",
  ],
  write: [
    "users",
    "clients",
    "projects",
    "suppliers",
    "subcontractors",
    "transactions",
    "maintenance",
    "settings",
    "editRequests",
    "assignments",
  ],
};

const clientRule: Rule = { modules: ["dashboard", "reports"], write: [] };

export function canAccess(viewer: Viewer, module: ModuleKey, write = false) {
  if (viewer.roleName === "Super User") {
    const rule = superUserRule;
    return (write ? rule.write : rule.modules).includes(module);
  }

  if (viewer.userType === "Client") {
    const rule = clientRule;
    return (write ? rule.write : rule.modules).includes(module);
  }

  // Department is the source of module scope. The role does not grant access
  // to a department's modules by itself.
  const matrixLabel = viewer.department || viewer.roleName;
  const rule: Rule = departmentMatrix[matrixLabel] ?? {
    modules: [],
    write: [],
  };

  return (write ? rule.write : rule.modules).includes(module);
}

// Progress Reports are deliberately narrower than ordinary MD Office access.
// Only an MD Office Authorizer may perform final authorization. The legacy
// "MD Office" role is kept as a temporary compatibility path for existing
// accounts; new users cannot be assigned that role.
export function canManageProjectReports(viewer: Viewer) {
  return (
    viewer.userType === "Staff" &&
    viewer.department === "MD Office" &&
    ["Authorizer", "MD Office"].includes(viewer.roleName)
  );
}

// Operations remains department-driven: the existing workflow does not split
// submission/review behavior between Initiator and Authorizer.
export function canSubmitProgressReports(viewer: Viewer) {
  return viewer.userType === "Staff" && viewer.department === "Operations";
}

export function canCreateClientOrProject(viewer: Viewer) {
  return (
    viewer.userType === "Staff" &&
    (viewer.roleName === "Super User" ||
      ["Business Development", "MD Office"].includes(viewer.department ?? ""))
  );
}

// MD Office and Audit/Internal Control are allowed to see financial details.
// Operations and Business Development retain non-financial visibility only.
export function canViewFinancialRecords(viewer: Viewer) {
  return !["Operations", "Business Development"].includes(
    viewer.department ?? "",
  );
}