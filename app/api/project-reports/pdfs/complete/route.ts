import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAX_REPORT_BYTES, REPORT_BUCKET } from "@/lib/project-reports";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (viewer.userType !== "Staff" || viewer.department !== "Operations") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const reportid = Number(body.reportid);
  const filename = String(body.filename ?? "");
  const filesize = Number(body.filesize);
  const storagepath = String(body.storagepath ?? "");
  if (!Number.isSafeInteger(reportid) || reportid < 1 || !filename || filename.length > 255 ||
      !filename.toLowerCase().endsWith(".pdf") || body.mimetype !== "application/pdf" ||
      !Number.isSafeInteger(filesize) || filesize < 1 || filesize > MAX_REPORT_BYTES) {
    return NextResponse.json({ error: "Invalid PDF details." }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data: report } = await admin.from("projectreports")
    .select("reportid,uploadedbyuserid,reviewstatus,projectid,reportweek")
    .eq("reportid", reportid).maybeSingle();
  const prefix = report ? `${report.projectid}/${report.reportweek}/supporting/${reportid}/` : "";
  if (!report || report.uploadedbyuserid !== viewer.userId || report.reviewstatus !== "Submitted" ||
      !storagepath.startsWith(prefix) || storagepath === prefix) {
    return NextResponse.json({ error: "PDF upload is not permitted for this report." }, { status: 403 });
  }
  // Confirm that the object actually exists before inserting its metadata.
  const { data: object, error: objectError } = await admin.storage.from(REPORT_BUCKET).info(storagepath);
  if (objectError || !object) {
    return NextResponse.json({ error: "PDF was not found in storage. Upload it again." }, { status: 400 });
  }
if (
  Number(object.size) !== filesize ||
  object.metadata?.mimetype !== "application/pdf"
) {
    return NextResponse.json({ error: "Uploaded PDF does not match its declared metadata." }, { status: 400 });
  }
  const { data, error } = await admin.from("projectreportpdfs").insert({
    reportid, filename, filesize, mimetype: "application/pdf", storagepath,
  }).select("pdfid").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, pdfid: data.pdfid }, { status: 201 });
}
