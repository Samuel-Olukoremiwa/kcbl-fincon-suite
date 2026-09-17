import type { Viewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageProjectReports } from "@/lib/access";

export const REPORT_BUCKET = "project-reports";
export const MAX_REPORT_BYTES = 100 * 1024 * 1024;

export function validReportMonth(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-01$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export async function canReadProjectReport(viewer: Viewer, projectId: string) {
  if (canManageProjectReports(viewer) || viewer.roleName === "Super User") return true;
  if (viewer.userType !== "Client") return false;
  const admin = createAdminClient();
  const { data: client } = await admin.from("clients").select("clientid").eq("linkeduserid", viewer.userId).maybeSingle();
  if (!client) return false;
  const { data: project } = await admin.from("projects").select("projectid").eq("projectid", projectId).eq("clientid", client.clientid).maybeSingle();
  return Boolean(project);
}
