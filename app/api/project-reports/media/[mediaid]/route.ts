import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { canReadProjectReport, MEDIA_BUCKET } from "@/lib/project-reports";

export async function GET(
  _request: Request,
  { params }: { params: { mediaid: string } },
) {
  const viewer = await getViewer();
  const admin = createAdminClient();
  const { data: media } = await admin
    .from("projectreportmedia")
    .select("mediaid, reportid, filename, storagepath, mimetype, mediatype")
    .eq("mediaid", params.mediaid)
    .maybeSingle();

  if (!media) {
    return NextResponse.json({ error: "Media not found." }, { status: 404 });
  }

  const { data: report } = await admin
    .from("projectreports")
    .select("projectid, uploadedbyuserid, reporttype, reviewstatus")
    .eq("reportid", media.reportid)
    .maybeSingle();

  if (!report || !(await canReadProjectReport(viewer, report))) {
    return NextResponse.json({ error: "Media not found." }, { status: 404 });
  }

  const { data: file, error } = await admin.storage
    .from(MEDIA_BUCKET)
    .download(media.storagepath);

  if (error || !file) {
    return NextResponse.json(
      { error: error?.message ?? "Unable to load attachment." },
      { status: 502 },
    );
  }

  const filename = String(media.filename || "attachment").replace(/[\\r\\n"]/g, "_");
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"]);
  const contentType = allowedTypes.has(media.mimetype)
    ? media.mimetype
    : (media.mediatype === "Video" ? "video/mp4" : "image/jpeg");
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
