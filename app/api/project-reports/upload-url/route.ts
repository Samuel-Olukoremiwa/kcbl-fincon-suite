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
      { error: "Only assigned Operations staff may upload Progress Reports." },
      { status: 403 },
    );
  const { projectid, reportweek, filename, filesize, mimetype } =
    await request.json();
  if (
    !projectid ||
    !validReportWeek(reportweek) ||
    typeof filename !== "string" ||
    !filename.toLowerCase().endsWith(".pdf") ||
    mimetype !== "application/pdf" ||
    !Number.isInteger(filesize) ||
    filesize < 1 ||
    filesize > MAX_REPORT_BYTES
  ) {
    return NextResponse.json(
      {
        error:
          "Choose a PDF no larger than 100 MB and a valid Monday-start reporting week.",
      },
      { status: 400 },
    );
  }
  const admin = createAdminClient();
  const [{ data: project }, { data: existing }] = await Promise.all([
    admin
      .from("projects")
      .select("projectid")
      .eq("projectid", projectid)
      .maybeSingle(),
    admin
      .from("projectreports")
      .select("reportid")
      .eq("projectid", projectid)
      .eq("reportweek", reportweek)
      .neq("reviewstatus", "Rejected")
      .maybeSingle(),
  ]);
  if (!project)
    return NextResponse.json(
      { error: "Project was not found." },
      { status: 404 },
    );
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
  if (existing)
    return NextResponse.json(
      {
        error:
          "A report for this project and week is already awaiting review or has been authorized. If it was rejected, you can resubmit for that week.",
      },
      { status: 409 },
    );
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagepath = `${projectid}/${reportweek}/${crypto.randomUUID()}-${safeName}`;
  const { data, error } = await admin.storage
    .from(REPORT_BUCKET)
    .createSignedUploadUrl(storagepath);
  return error
    ? NextResponse.json({ error: error.message }, { status: 500 })
    : NextResponse.json({ storagepath, token: data.token });
}