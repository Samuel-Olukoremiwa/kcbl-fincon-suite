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
      "settings",
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

  "Executive Director": {
    modules: ["dashboard", "audit"],
    write: [],
  },

  "Non-Executive Director": {
    modules: ["dashboard"],
    write: [],
  },

  "Finance & Admin": {
    modules: [
      "suppliers",
      "subcontractors",
      "transactions",
      "settings",
      "editRequests",
    ],
    write: [
      "suppliers",
      "subcontractors",
      "transactions",
      "editRequests",
    ],
  },

  "Business Development": {
    modules: [
      "users",
      "clients",
      "projects",
      "editRequests",
    ],
    write: [
      "users",
      "clients",
      "projects",
      "editRequests",
    ],
  },

  Operations: {
    modules: [
      "reports",
      "assignments",
    ],
    write: [
      "reports",
      "assignments",
    ],
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

const clientRule: Rule = {
  modules: [
    "dashboard",
    "reports",
  ],
  write: [],
};

export function canAccess(
  viewer: Viewer,
  module: ModuleKey,
  write = false,
) {
  if (viewer.roleName === "Super User") {
    const rule = superUserRule;

    return (
      write
        ? rule.write
        : rule.modules
    ).includes(module);
  }

  if (viewer.userType === "Client") {
    const rule = clientRule;

    return (
      write
        ? rule.write
        : rule.modules
    ).includes(module);
  }

  // Department is the source of module scope.
  // Role does not independently grant access to
  // another department's modules.
  const matrixLabel =
    viewer.department ||
    viewer.roleName;

  const rule: Rule =
    departmentMatrix[matrixLabel] ?? {
      modules: [],
      write: [],
    };

  return (
    write
      ? rule.write
      : rule.modules
  ).includes(module);
}

// Progress Reports are deliberately narrower than
// ordinary MD Office access.
//
// Only an MD Office Authorizer may perform final
// authorization.
//
// "MD Office" remains temporarily accepted as a
// legacy role for existing accounts.
export function canManageProjectReports(
  viewer: Viewer,
) {
  return (
    viewer.userType === "Staff" &&
    viewer.department === "MD Office" &&
    [
      "Authorizer",
      "MD Office",
    ].includes(viewer.roleName)
  );
}

// Operations remains department-driven for the
// current Progress Report workflow.
export function canSubmitProgressReports(
  viewer: Viewer,
) {
  return (
    viewer.userType === "Staff" &&
    viewer.department === "Operations"
  );
}

export function canCreateClientOrProject(
  viewer: Viewer,
) {
  return (
    viewer.userType === "Staff" &&
    (
      viewer.roleName === "Super User" ||
      [
        "Business Development",
        "MD Office",
      ].includes(
        viewer.department ?? "",
      )
    )
  );
}

// MD Office and Audit/Internal Control may view
// financial details.
//
// Operations and Business Development do not have
// financial-record visibility.
export function canViewFinancialRecords(
  viewer: Viewer,
) {
  return ![
    "Operations",
    "Business Development",
  ].includes(
    viewer.department ?? "",
  );
}

export type EditRequestEntityType =
  | "client"
  | "supplier"
  | "subcontractor";

const editRequestModuleByEntity:
  Record<
    EditRequestEntityType,
    ModuleKey
  > = {
    client: "clients",
    supplier: "suppliers",
    subcontractor: "subcontractors",
  };

/**
 * A staff member may submit an update request only
 * for a record type their department is permitted
 * to maintain.
 */
export function canSubmitEditRequest(
  viewer: Viewer,
  entityType: EditRequestEntityType,
) {
  return canAccess(
    viewer,
    editRequestModuleByEntity[entityType],
    true,
  );
}

/**
 * Update-request approval is entity-aware rather
 * than giving every Authorizer authority over
 * every type of record.
 *
 * Client updates:
 * - Business Development Authorizer
 * - MD Office Authorizer
 * - Super User
 *
 * Supplier/Subcontractor updates:
 * - Finance & Admin Authorizer
 * - MD Office Authorizer
 * - Super User
 */
export function canDecideEditRequest(
  viewer: Viewer,
  entityType: EditRequestEntityType,
) {
  if (
    viewer.roleName ===
    "Super User"
  ) {
    return true;
  }

  if (
    viewer.roleName !==
    "Authorizer"
  ) {
    return false;
  }

  if (
    entityType ===
    "client"
  ) {
    return [
      "Business Development",
      "MD Office",
    ].includes(
      viewer.department ?? "",
    );
  }

  return [
    "Finance & Admin",
    "MD Office",
  ].includes(
    viewer.department ?? "",
  );
}