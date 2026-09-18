import type { Viewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  canManageProjectReports,
  canSubmitProgressReports,
} from "@/lib/access";

export const REPORT_BUCKET = "project-reports";
export const MAX_REPORT_BYTES = 100 * 1024 * 1024;

export function validReportWeek(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  // Weekly reporting periods always begin on Monday.
  return !Number.isNaN(parsed.getTime()) && parsed.getUTCDay() === 1;
}

export async function canReadProjectReport(viewer: Viewer, projectId: string) {
  if (canManageProjectReports(viewer) || viewer.roleName === "Super User")
    return true;
  if (canSubmitProgressReports(viewer)) {
    const admin = createAdminClient();
    const { data: assignment } = await admin
      .from("projectassignments")
      .select("assignmentid")
      .eq("projectid", projectId)
      .eq("userid", viewer.userId)
      .eq("approvalstatus", "Approved")
      .eq("active", true)
      .maybeSingle();
    return Boolean(assignment);
  }
  if (viewer.userType !== "Client") return false;
  const admin = createAdminClient();
  const { data: client } = await admin
    .from("clients")
    .select("clientid")
    .eq("linkeduserid", viewer.userId)
    .maybeSingle();
  if (!client) return false;
  const { data: project } = await admin
    .from("projects")
    .select("projectid")
    .eq("projectid", projectId)
    .eq("clientid", client.clientid)
    .maybeSingle();
  return Boolean(project);
}
