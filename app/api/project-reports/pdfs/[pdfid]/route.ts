import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { canReadProjectReport, REPORT_BUCKET } from "@/lib/project-reports";

export async function GET(
  _request: Request,
  { params }: { params: { pdfid: string } },
) {
  const viewer = await getViewer();
  const admin = createAdminClient();
  const { data: attachment } = await admin
    .from("projectreportpdfs")
    .select("pdfid, storagepath, reportid, filename")
    .eq("pdfid", params.pdfid)
    .maybeSingle();

  if (!attachment) {
    return NextResponse.json({ error: "PDF not found." }, { status: 404 });
  }

  const { data: report } = await admin
    .from("projectreports")
    .select("projectid, uploadedbyuserid, reporttype, reviewstatus")
    .eq("reportid", attachment.reportid)
    .maybeSingle();

  if (!report || !(await canReadProjectReport(viewer, report))) {
    return NextResponse.json({ error: "PDF not found." }, { status: 404 });
  }

  const { data: file, error } = await admin.storage
    .from(REPORT_BUCKET)
    .download(attachment.storagepath);

  if (error || !file) {
    return NextResponse.json(
      { error: error?.message ?? "Unable to load attachment." },
      { status: 502 },
    );
  }

  const filename = String(attachment.filename || "attachment").replace(/[\\r\\n"]/g, "_");
  const contentType = "application/pdf";
  return new Response(file, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
