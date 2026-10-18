import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { canReadProjectReport, REPORT_BUCKET } from "@/lib/project-reports";

export async function GET(_request: Request, { params }: { params: { pdfid: string } }) {
  const viewer = await getViewer();
  const admin = createAdminClient();
  const { data: attachment } = await admin.from("projectreportpdfs")
    .select("pdfid,storagepath,reportid")
    .eq("pdfid", params.pdfid).maybeSingle();
  if (!attachment) return NextResponse.json({ error: "PDF not found." }, { status: 404 });
  const { data: report } = await admin.from("projectreports")
    .select("projectid,uploadedbyuserid,reporttype,reviewstatus")
    .eq("reportid", attachment.reportid).maybeSingle();
  if (!report || !(await canReadProjectReport(viewer, report))) {
    return NextResponse.json({ error: "PDF not found." }, { status: 404 });
  }
  const { data, error } = await admin.storage.from(REPORT_BUCKET)
    .createSignedUrl(attachment.storagepath, 60);
  if (error || !data) return NextResponse.json({ error: "Unable to open PDF." }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
