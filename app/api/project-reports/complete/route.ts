import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  MAX_REPORT_BYTES,
  REPORT_BUCKET,
  validReportWeek,
} from "@/lib/project-reports";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (viewer.userType !== "Staff" || viewer.department !== "Operations")
    return NextResponse.json(
      {
        error:
          "Only assigned Operations staff may complete a Progress Report upload.",
      },
      { status: 403 },
    );
  const { projectid, reportweek, filename, filesize, storagepath } =
    await request.json();
  if (
    !projectid ||
    !validReportWeek(reportweek) ||
    typeof filename !== "string" ||
    !filename.toLowerCase().endsWith(".pdf") ||
    !Number.isInteger(filesize) ||
    filesize < 1 ||
    filesize > MAX_REPORT_BYTES ||
    typeof storagepath !== "string" ||
    !storagepath.startsWith(`${projectid}/${reportweek}/`)
  ) {
    return NextResponse.json(
      { error: "Invalid report upload details." },
      { status: 400 },
    );
  }
  const admin = createAdminClient();
  const { data: assignment } = await admin
    .from("projectassignments")
    .select("assignmentid")
    .eq("projectid", projectid)
    .eq("userid", viewer.userId)
    .eq("approvalstatus", "Approved")
    .eq("active", true)
    .maybeSingle();
  if (!assignment)
    return NextResponse.json(
      { error: "You are not assigned to this project." },
      { status: 403 },
    );
  const { data: report, error } = await admin
    .from("projectreports")
    .insert({
      projectid,
      reportweek,
      filename,
      filesize,
      storagepath,
      uploadedbyuserid: viewer.userId,
    })
    .select("reportid")
    .single();
  if (error) {
    await admin.storage.from(REPORT_BUCKET).remove([storagepath]);
    return NextResponse.json(
      {
        error:
          error.code === "23505"
            ? "A report for this project and week already exists."
            : error.message,
      },
      { status: 400 },
    );
  }

  // The client is no longer notified here. A report at this stage has not
  // been reviewed by a supervisor or authorized by MD Office — it may still
  // be rejected at either stage. The client-notification email now fires
  // only on Authorization, in app/api/project-reports/[id]/authorize/route.ts.

  return NextResponse.json(
    {
      ok: true,
      emailMessage: "Report uploaded and sent for supervisor review.",
    },
    { status: 201 },
  );
}