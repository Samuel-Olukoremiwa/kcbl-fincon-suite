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
  | "assignments"
  | "variations"
  | "inhouse";

type Rule = {
  modules: ModuleKey[];
  write: ModuleKey[];
};

const allModules: ModuleKey[] = [
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
  "variations",
  "inhouse",
];

const departmentMatrix: Record<string, Rule> = {
  MD: {
    modules: [
      "variations",
      "inhouse",
      "variations",
      "inhouse",
      "dashboard",
      "clients",
      "projects",
      "suppliers",
      "subcontractors",
      "transactions",
      "audit",
      "reports",
      "assignments",
    ],
    write: ["assignments"],
  },

  "MD Office": {
    modules: [
      "variations",
      "inhouse",
      "variations",
      "inhouse",
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
      "users",
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
    modules: allModules,
    write: [],
  },

  "Non-Executive Director": {
    modules: [
      "dashboard",
      "projects",
    ],
    write: [],
  },

  "Finance & Admin": {
    modules: [
      "variations",
      "inhouse",
      "variations",
      "inhouse",
      "suppliers",
      "subcontractors",
      "transactions",
      "settings",
      "editRequests",
    ],
    write: [
      "variations",
      "inhouse",
      "variations",
      "inhouse",
      "suppliers",
      "subcontractors",
      "transactions",
      "editRequests",
    ],
  },

  /*
   * Business Development deliberately has NO Users & Staff Database access.
   * Client maker-checker actions are role-specific and enforced by the
   * helper functions below.
   */
  "Business Development": {
    modules: [
      "clients",
      "projects",
      "editRequests",
    ],
    write: [
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
      "variations",
      "inhouse",
      "variations",
      "inhouse",
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
  modules: allModules,

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
    "reports",
    "assignments",
  ],
};

const clientRule: Rule = {
  modules: [
    "dashboard",
    "reports",
    "variations",
  ],
  write: [],
};

export function canAccess(
  viewer: Viewer,
  module: ModuleKey,
  write = false,
) {
  if (
    viewer.roleName ===
    "Super User"
  ) {
    return (
      write
        ? superUserRule.write
        : superUserRule.modules
    ).includes(module);
  }

  if (
    viewer.userType ===
    "Client"
  ) {
    return (
      write
        ? clientRule.write
        : clientRule.modules
    ).includes(module);
  }

  const matrixLabel =
    viewer.department ||
    viewer.roleName;

  const rule =
    departmentMatrix[
      matrixLabel
    ] ?? {
      modules: [],
      write: [],
    };

  return (
    write
      ? rule.write
      : rule.modules
  ).includes(module);
}

/*
 * ============================================================
 * CLIENT ONBOARDING MAKER-CHECKER
 * ============================================================
 *
 * Business Development Initiator:
 * - may submit a new client onboarding request
 * - may submit client update requests
 *
 * Business Development Authorizer:
 * - may review/approve/reject onboarding requests
 * - may review/approve/reject client update requests
 * - may NOT create/onboard a client
 * - may NOT submit client updates
 *
 * Super User remains an administrative override.
 * MD Office retains its existing direct-create capability.
 */

export function canSubmitClientOnboarding(
  viewer: Viewer,
) {
  return (
    viewer.userType ===
      "Staff" &&
    viewer.department ===
      "Business Development" &&
    viewer.roleName ===
      "Initiator"
  );
}

export function canReviewClientOnboarding(
  viewer: Viewer,
) {
  return (
    viewer.userType ===
      "Staff" &&
    (
      viewer.roleName ===
        "Super User" ||
      (
        viewer.department ===
          "Business Development" &&
        viewer.roleName ===
          "Authorizer"
      )
    )
  );
}

export function canDirectCreateClient(
  viewer: Viewer,
) {
  return (
    viewer.userType ===
      "Staff" &&
    (
      viewer.roleName ===
        "Super User" ||
      viewer.department ===
        "MD Office"
    )
  );
}

export function canSubmitClientEditRequest(
  viewer: Viewer,
) {
  if (
    viewer.roleName ===
    "Super User"
  ) {
    return true;
  }

  if (
    viewer.department ===
    "Business Development"
  ) {
    return (
      viewer.roleName ===
      "Initiator"
    );
  }

  return canAccess(
    viewer,
    "clients",
    true,
  );
}

/*
 * Projects retain the existing creation scope.
 * This helper is now used for project creation only.
 */
export function canCreateClientOrProject(
  viewer: Viewer,
) {
  return (
    viewer.userType ===
      "Staff" &&
    (
      viewer.roleName ===
        "Super User" ||
      [
        "Business Development",
        "MD Office",
      ].includes(
        viewer.department ??
          "",
      )
    )
  );
}

export function canManageProjectReports(
  viewer: Viewer,
) {
  return (
    viewer.userType ===
      "Staff" &&
    viewer.department ===
      "MD Office" &&
    [
      "Authorizer",
      "MD Office",
    ].includes(
      viewer.roleName,
    )
  );
}

export function canSubmitProgressReports(
  viewer: Viewer,
) {
  return (
    viewer.userType ===
      "Staff" &&
    viewer.department ===
      "Operations"
  );
}

export function canViewFinancialRecords(
  viewer: Viewer,
) {
  return ![
    "Operations",
    "Business Development",
  ].includes(
    viewer.department ??
      "",
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
    subcontractor:
      "subcontractors",
  };

export function canSubmitEditRequest(
  viewer: Viewer,
  entityType: EditRequestEntityType,
) {
  if (
    entityType ===
    "client"
  ) {
    return canSubmitClientEditRequest(
      viewer,
    );
  }

  return canAccess(
    viewer,
    editRequestModuleByEntity[
      entityType
    ],
    true,
  );
}

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
      viewer.department ??
        "",
    );
  }

  return [
    "Finance & Admin",
    "MD Office",
  ].includes(
    viewer.department ??
      "",
  );
}
