import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { canReadProjectReport, REPORT_BUCKET } from "@/lib/project-reports";

export async function GET(_request: Request, { params }: { params: { reportid: string } }) {
  const viewer = await getViewer();
  const admin = createAdminClient();
  const { data: report } = await admin.from("projectreports").select("projectid,storagepath").eq("reportid", params.reportid).maybeSingle();
  if (!report || !(await canReadProjectReport(viewer, report.projectid))) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  const { data, error } = await admin.storage.from(REPORT_BUCKET).createSignedUrl(report.storagepath, 60);
  return error || !data ? NextResponse.json({ error: error?.message ?? "Unable to open report." }, { status: 500 }) : NextResponse.redirect(data.signedUrl);
}
