import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  MAX_REPORT_BYTES,
  REPORT_BUCKET,
  reportTypeForAssignmentRole,
  validReportWeek,
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
          "Only assigned Operations staff may complete a project report upload.",
      },
      { status: 403 },
    );
  }

  const {
    projectid,
    reportweek,
    filename,
    filesize,
    storagepath,
    progresspct,
  } = await request.json();

  if (
    !projectid ||
    !validReportWeek(
      reportweek,
    ) ||
    typeof filename !==
      "string" ||
    !filename
      .toLowerCase()
      .endsWith(".pdf") ||
    !Number.isInteger(
      filesize,
    ) ||
    filesize < 1 ||
    filesize >
      MAX_REPORT_BYTES ||
    typeof storagepath !==
      "string" ||
    !storagepath.startsWith(
      `${projectid}/${reportweek}/`,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid report upload details.",
      },
      { status: 400 },
    );
  }

  const admin =
    createAdminClient();

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
    await admin.storage
      .from(REPORT_BUCKET)
      .remove([
        storagepath,
      ]);

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

  const reporttype =
    reportTypeForAssignmentRole(
      assignment.assignmentrole,
    );

  let progress:
    | number
    | null = null;

  if (
    reporttype ===
    "Project Manager"
  ) {
    progress =
      Number(progresspct);

    if (
      !Number.isFinite(
        progress,
      ) ||
      progress < 0 ||
      progress > 100
    ) {
      await admin.storage
        .from(REPORT_BUCKET)
        .remove([
          storagepath,
        ]);

      return NextResponse.json(
        {
          error:
            "Project Manager progress reports require a progress percentage between 0 and 100.",
        },
        { status: 400 },
      );
    }
  }

  const {
    data: report,
    error,
  } = await admin
    .from("projectreports")
    .insert({
      projectid,
      reportweek,
      reporttype,
      filename,
      filesize,
      storagepath,
      uploadedbyuserid:
        viewer.userId,
      submittedbyuserid:
        viewer.userId,
      progresspct:
        progress,
      reviewstatus:
        "Submitted",
    })
    .select(
      "reportid,updatedat,reporttype",
    )
    .single();

  if (error) {
    await admin.storage
      .from(REPORT_BUCKET)
      .remove([
        storagepath,
      ]);

    return NextResponse.json(
      {
        error:
          error.message,
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      reportid:
        report.reportid,
      reporttype:
        report.reporttype,
      updatedat:
        report.updatedat,
      emailMessage:
        reporttype ===
        "Project Manager"
          ? "Project Manager Progress Report uploaded and sent to MD Office for review."
          : "Operations Report uploaded and sent to the Project Manager for review.",
    },
    { status: 201 },
  );
}
