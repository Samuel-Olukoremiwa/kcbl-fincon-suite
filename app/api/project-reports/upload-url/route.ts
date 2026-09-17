import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageProjectReports } from "@/lib/access";
import { MAX_REPORT_BYTES, REPORT_BUCKET, validReportMonth } from "@/lib/project-reports";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!canManageProjectReports(viewer)) return NextResponse.json({ error: "Only MD Office may upload monthly project reports." }, { status: 403 });
  const { projectid, reportmonth, filename, filesize, mimetype } = await request.json();
  if (!projectid || !validReportMonth(reportmonth) || typeof filename !== "string" || !filename.toLowerCase().endsWith(".pdf") || mimetype !== "application/pdf" || !Number.isInteger(filesize) || filesize < 1 || filesize > MAX_REPORT_BYTES) {
    return NextResponse.json({ error: "Choose a PDF no larger than 100 MB and a valid reporting month." }, { status: 400 });
  }
  const admin = createAdminClient();
  const [{ data: project }, { data: existing }] = await Promise.all([
    admin.from("projects").select("projectid").eq("projectid", projectid).maybeSingle(),
    admin.from("projectreports").select("reportid").eq("projectid", projectid).eq("reportmonth", reportmonth).maybeSingle(),
  ]);
  if (!project) return NextResponse.json({ error: "Project was not found." }, { status: 404 });
  if (existing) return NextResponse.json({ error: "A report for this project and month already exists." }, { status: 409 });
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagepath = `${projectid}/${reportmonth}/${crypto.randomUUID()}-${safeName}`;
  const { data, error } = await admin.storage.from(REPORT_BUCKET).createSignedUploadUrl(storagepath);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ storagepath, token: data.token });
}
