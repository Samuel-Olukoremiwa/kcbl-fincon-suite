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
  if (!Number.isSafeInteger(reportid) || reportid < 1 || !filename || filename.length > 255 ||
      !filename.toLowerCase().endsWith(".pdf") || body.mimetype !== "application/pdf" ||
      !Number.isSafeInteger(filesize) || filesize < 1 || filesize > MAX_REPORT_BYTES) {
    return NextResponse.json({ error: "Choose a PDF under 100 MB." }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data: report } = await admin.from("projectreports")
    .select("reportid,uploadedbyuserid,reviewstatus,projectid,reportweek")
    .eq("reportid", reportid).maybeSingle();
  if (!report || report.uploadedbyuserid !== viewer.userId || report.reviewstatus !== "Submitted") {
    return NextResponse.json({ error: "Only the uploader can add PDFs before review." }, { status: 403 });
  }
  const { count, error: countError } = await admin.from("projectreportpdfs")
    .select("pdfid", { count: "exact", head: true }).eq("reportid", reportid);
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
  if ((count ?? 0) >= 7) return NextResponse.json({ error: "Maximum 8 PDFs per report." }, { status: 400 });
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagepath = `${report.projectid}/${report.reportweek}/supporting/${reportid}/${crypto.randomUUID()}-${safeName}`;
  const { data, error } = await admin.storage.from(REPORT_BUCKET).createSignedUploadUrl(storagepath);
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Could not prepare upload." }, { status: 500 });
  return NextResponse.json({ storagepath, token: data.token });
}
