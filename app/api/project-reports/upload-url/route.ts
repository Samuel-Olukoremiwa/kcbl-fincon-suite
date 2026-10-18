import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  MAX_REPORT_BYTES,
  REPORT_BUCKET,
  reportTypeForAssignmentRole,
  validReportWeek,
  validReportDate,
  weekStartForDate,
} from "@/lib/project-reports";

export async function POST(
  request: Request,
) {
  const viewer = await getViewer();

  if (
    viewer.userType !== "Staff" ||
    viewer.department !== "Operations"
  ) {
    return NextResponse.json(
      {
        error:
          "Only assigned Operations staff may upload project reports.",
      },
      { status: 403 },
    );
  }

  const {
    projectid,
    reportweek,
    reportdate,
    filename,
    filesize,
    mimetype,
  } = await request.json();

  if (
    !projectid ||
    typeof filename !==
      "string" ||
    !filename
      .toLowerCase()
      .endsWith(".pdf") ||
    mimetype !==
      "application/pdf" ||
    !Number.isInteger(
      filesize,
    ) ||
    filesize < 1 ||
    filesize >
      MAX_REPORT_BYTES
  ) {
    return NextResponse.json(
      {
        error:
          "Choose a PDF no larger than 100 MB and a valid Monday-start reporting week.",
      },
      { status: 400 },
    );
  }

  const admin =
    createAdminClient();

  const {
    data: project,
  } = await admin
    .from("projects")
    .select("projectid")
    .eq(
      "projectid",
      projectid,
    )
    .maybeSingle();

  if (!project) {
    return NextResponse.json(
      {
        error:
          "Project was not found.",
      },
      { status: 404 },
    );
  }

  const {
    data: assignments,
    error: assignmentError,
  } = await admin
    .from("projectassignments")
    .select(
      "assignmentid,assignmentrole",
    )
    .eq(
      "projectid",
      projectid,
    )
    .eq(
      "userid",
      viewer.userId,
    )
    .eq(
      "approvalstatus",
      "Approved",
    )
    .eq(
      "active",
      true,
    );

  if (
    assignmentError ||
    !assignments?.length
  ) {
    return NextResponse.json(
      {
        error:
          assignmentError?.message ??
          "You are not assigned to this project.",
      },
      {
        status:
          assignmentError
            ? 500
            : 403,
      },
    );
  }

  const assignment =
    assignments.find(
      (item) =>
        item.assignmentrole ===
        "Project Manager",
    ) ?? assignments[0];

  const isManager = assignment.assignmentrole === "Project Manager";
  if (isManager ? !validReportWeek(reportweek) : !validReportDate(reportdate) || reportweek !== weekStartForDate(reportdate)) {
    return NextResponse.json({ error: "Select a valid reporting week (Project Manager) or daily reporting date (Operations)." }, { status: 400 });
  }

  const safeName =
    filename.replace(
      /[^a-zA-Z0-9._-]/g,
      "_",
    );

  const storagepath =
    `${projectid}/${reportweek}/${crypto.randomUUID()}-${safeName}`;

  const {
    data,
    error,
  } = await admin.storage
    .from(REPORT_BUCKET)
    .createSignedUploadUrl(
      storagepath,
    );

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    storagepath,
    token: data.token,
    reporttype:
      reportTypeForAssignmentRole(
        assignment.assignmentrole,
      ),
  });
}
