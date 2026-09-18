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

// Keyed by DEPARTMENT, per the access matrix — not by role. Role
// (Initiator vs Authorizer) governs submit-vs-approve *within* a
// department that has write access, not which modules are visible.
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
    const r = superUserRule;
    return (write ? r.write : r.modules).includes(module);
  }
  if (viewer.userType === "Client" || viewer.roleName === "Client") {
    const r = clientRule;
    return (write ? r.write : r.modules).includes(module);
  }

  // Some existing accounts have the matrix label stored as their role rather
  // than department. Supporting that legacy shape still applies the same
  // least-privilege scope; an Initiator/Authorizer alone grants nothing.
  const matrixLabel = viewer.department || viewer.roleName;
  const rule: Rule = departmentMatrix[matrixLabel] ?? {
    modules: [],
    write: [],
  };

  if (!(write ? rule.write : rule.modules).includes(module)) return false;

  return true;
}

// Progress Reports are deliberately narrower than ordinary project access.
export function canManageProjectReports(viewer: Viewer) {
  return (
    viewer.userType === "Staff" &&
    viewer.department === "MD Office" &&
    ["Authorizer", "MD Office"].includes(viewer.roleName)
  );
}
export function canSubmitProgressReports(viewer: Viewer) {
  return viewer.userType === "Staff" && viewer.department === "Operations";
}

export function canCreateClientOrProject(viewer: Viewer) {
  return (
    viewer.userType === "Staff" &&
    viewer.roleName !== "MD" &&
    (viewer.roleName === "Super User" ||
      ["Business Development", "MD Office"].includes(viewer.department ?? ""))
  );
}

// These teams require project, client, or audit visibility to perform their
// work, but must never receive financial values from page queries or APIs.
export function canViewFinancialRecords(viewer: Viewer) {
  return ![
    "Operations",
    "Business Development",
    "Audit/Internal Control",
  ].includes(viewer.department ?? "");
}
