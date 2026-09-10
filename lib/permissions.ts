import { createClient } from "@/lib/supabase/server";

export const MODULES = [
  "Dashboard", "Clients/KYC", "Project", "Suppliers",
  "SubContractor", "Transactions", "AuditTrail",
] as const;
export type Module = (typeof MODULES)[number];
export type AccessRight = "Read Only" | "Read & Write";

export async function getDepartmentPermissions(
  department: string | null
): Promise<Record<Module, AccessRight>> {
  const map = {} as Record<Module, AccessRight>;
  if (!department) return map;

  const supabase = createClient();
  const { data } = await supabase
    .from("departmentmodulepermissions")
    .select("module, accessright")
    .eq("department", department);

  for (const row of data ?? []) {
    map[row.module as Module] = row.accessright as AccessRight;
  }
  return map;
}