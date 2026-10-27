import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { canReadProjectReport, REPORT_BUCKET } from "@/lib/project-reports";

export async function GET(
  _request: Request,
  { params }: { params: { reportid: string } },
) {
  const viewer = await getViewer();
  const admin = createAdminClient();
  const { data: report } = await admin
    .from("projectreports")
    .select("reportid, projectid, storagepath, reviewstatus, reporttype, uploadedbyuserid, filename")
    .eq("reportid", params.reportid)
    .maybeSingle();

  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  

  if (!report || !(await canReadProjectReport(viewer, report))) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const { data: file, error } = await admin.storage
    .from(REPORT_BUCKET)
    .download(report.storagepath);

  if (error || !file) {
    return NextResponse.json(
      { error: error?.message ?? "Unable to load attachment." },
      { status: 502 },
    );
  }

  const filename = String(report.filename || "attachment").replace(/[\\r\\n"]/g, "_");
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
