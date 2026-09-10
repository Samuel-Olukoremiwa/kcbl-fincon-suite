import type { Viewer } from "@/lib/viewer";

export type ModuleKey =
  | "dashboard" | "users" | "clients" | "projects" | "suppliers"
  | "subcontractors" | "transactions" | "audit" | "maintenance" | "settings" | "editRequests";

type Rule = { modules: ModuleKey[]; write: ModuleKey[] };

// Keyed by DEPARTMENT, per the access matrix — not by role. Role
// (Initiator vs Authorizer) governs submit-vs-approve *within* a
// department that has write access, not which modules are visible.
const departmentMatrix: Record<string, Rule> = {
  "MD": {
    modules: ["dashboard", "clients", "projects", "suppliers", "subcontractors", "transactions", "audit"],
    write: [],
  },
  "MD Office": {
    modules: ["clients", "projects", "suppliers", "subcontractors", "audit", "editRequests"],
    write: ["clients", "projects", "suppliers", "subcontractors", "editRequests"],
  },
  "Executive Director": { modules: ["dashboard", "audit"], write: [] },
  "Non-Executive Director": { modules: ["dashboard"], write: [] },
  "Finance & Admin": {
    modules: ["suppliers", "subcontractors", "transactions", "editRequests"],
    write: ["suppliers", "subcontractors", "transactions", "editRequests"],
  },
  "Business Development": {
    modules: ["dashboard", "clients", "projects", "editRequests"],
    write: ["clients", "projects", "editRequests"],
  },
  "Operations": { modules: ["projects"], write: [] },
  "Audit/Internal Control": {
    modules: ["dashboard", "clients", "projects", "suppliers", "subcontractors", "audit", "editRequests", "settings"],
    write: [],
  },
};

const superUserRule: Rule = {
  modules: ["dashboard", "users", "clients", "projects", "suppliers", "subcontractors", "transactions", "audit", "maintenance", "settings", "editRequests"],
  write: ["users", "clients", "projects", "suppliers", "subcontractors", "transactions", "maintenance", "settings", "editRequests"],
};

const clientRule: Rule = { modules: ["dashboard"], write: [] };

export function canAccess(viewer: Viewer, module: ModuleKey, write = false) {
  if (viewer.roleName === "Super User") {
    const r = superUserRule;
    return (write ? r.write : r.modules).includes(module);
  }
  if (viewer.userType === "Client" || viewer.roleName === "Client") {
    const r = clientRule;
    return (write ? r.write : r.modules).includes(module);
  }

  const rule: Rule = (viewer.department ? departmentMatrix[viewer.department] : undefined) ?? { modules: [], write: [] };

  if (!(write ? rule.write : rule.modules).includes(module)) return false;

  // Within a write-enabled department, an Authorizer can approve/reject
  // but should not submit new records — mirrors your maker-checker rule.
  if (write && viewer.roleName === "Authorizer") return false;

  return true;
}