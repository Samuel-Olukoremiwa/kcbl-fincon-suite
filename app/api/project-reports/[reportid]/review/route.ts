import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendProjectReportEmail } from "@/lib/mailer";

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: {
      reportid: string;
    };
  },
) {
  const viewer = await getViewer();

  if (
    viewer.userType !== "Staff" ||
    viewer.department !== "Operations"
  ) {
    return NextResponse.json(
      {
        error:
          "Only the assigned Project Manager may review an Operations report.",
      },
      { status: 403 },
    );
  }

  const {
    comments,
    decision,
  } = await request.json();

  if (
    decision !== "Reviewed" &&
    decision !== "Rejected"
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid review decision.",
      },
      { status: 400 },
    );
  }

  const trimmedComments =
    typeof comments ===
    "string"
      ? comments.trim()
      : "";

  if (
    decision === "Rejected" &&
    !trimmedComments
  ) {
    return NextResponse.json(
      {
        error:
          "A rejection reason is required.",
      },
      { status: 400 },
    );
  }

  const admin =
    createAdminClient();

  const {
    data: report,
    error: reportError,
  } = await admin
    .from("projectreports")
    .select(
      `
        projectid,
        reporttype,
        reviewstatus,
        reportweek,
        uploadedbyuserid,
        filename
      `,
    )
    .eq(
      "reportid",
      params.reportid,
    )
    .maybeSingle();

  if (reportError) {
    return NextResponse.json(
      {
        error:
          reportError.message,
      },
      { status: 500 },
    );
  }

  if (!report) {
    return NextResponse.json(
      {
        error:
          "Report not found.",
      },
      { status: 404 },
    );
  }

  if (
    report.reporttype !==
    "Operations"
  ) {
    return NextResponse.json(
      {
        error:
          "Project Manager progress reports are reviewed by MD Office, not through this review step.",
      },
      { status: 400 },
    );
  }

  if (
    report.reviewstatus !==
    "Submitted"
  ) {
    return NextResponse.json(
      {
        error:
          "This Operations report is no longer awaiting Project Manager review.",
      },
      { status: 400 },
    );
  }

  const {
    data: managerAssignment,
    error:
      assignmentError,
  } = await admin
    .from("projectassignments")
    .select("assignmentid")
    .eq(
      "projectid",
      report.projectid,
    )
    .eq(
      "userid",
      viewer.userId,
    )
    .eq(
      "assignmentrole",
      "Project Manager",
    )
    .eq(
      "approvalstatus",
      "Approved",
    )
    .eq(
      "active",
      true,
    )
    .maybeSingle();

  if (assignmentError) {
    return NextResponse.json(
      {
        error:
          assignmentError.message,
      },
      { status: 500 },
    );
  }

  if (!managerAssignment) {
    return NextResponse.json(
      {
        error:
          "Only the approved Project Manager for this project may review this report.",
      },
      { status: 403 },
    );
  }

  const nextStatus =
    decision === "Rejected"
      ? "Rejected"
      : "Reviewed";

  const {
    error: updateError,
  } = await admin
    .from("projectreports")
    .update({
      reviewstatus:
        nextStatus,
      supervisorcomments:
        trimmedComments ||
        null,
      supervisorreviewedbyuserid:
        viewer.userId,
      supervisorreviewedat:
        new Date().toISOString(),
    })
    .eq(
      "reportid",
      params.reportid,
    )
    .eq(
      "reviewstatus",
      "Submitted",
    );

  if (updateError) {
    return NextResponse.json(
      {
        error:
          updateError.message,
      },
      { status: 400 },
    );
  }

  if (
    nextStatus !==
    "Rejected"
  ) {
    return NextResponse.json({
      ok: true,
      emailSent: false,
      message:
        "Operations Report approved by the Project Manager.",
    });
  }

  const [
    {
      data: uploader,
    },
    {
      data: project,
    },
  ] = await Promise.all([
    admin
      .from("users")
      .select(
        "email,fullname",
      )
      .eq(
        "userid",
        report.uploadedbyuserid,
      )
      .maybeSingle(),

    admin
      .from("projects")
      .select(
        "projecttitle",
      )
      .eq(
        "projectid",
        report.projectid,
      )
      .maybeSingle(),
  ]);

  const uploaderEmail =
    typeof uploader?.email ===
    "string"
      ? uploader.email.trim()
      : "";

  if (!uploaderEmail) {
    return NextResponse.json({
      ok: true,
      emailSent: false,
      emailError:
        "The uploader does not have an email address.",
    });
  }

  const projectTitle =
    project?.projecttitle ??
    report.projectid;

  const result =
    await sendProjectReportEmail({
      to: uploaderEmail,

      subject:
        `Operations Report rejected by Project Manager: ${projectTitle}`,

      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b;">
          <h2>Operations Report Rejected</h2>

          <p>
            Hello ${uploader?.fullname ?? ""},
          </p>

          <p>
            Your Operations Report for
            <strong>${projectTitle}</strong>
            for the week of
            <strong>${report.reportweek}</strong>
            was rejected by the Project Manager.
          </p>

          <p>
            <strong>Reason for rejection:</strong>
          </p>

          <div style="padding: 12px; background: #f8fafc; border-left: 4px solid #dc2626; margin: 12px 0;">
            ${trimmedComments}
          </div>

          <p>
            Please correct the report and submit a new version.
          </p>

          <p>
            Regards,<br />
            KCBL FinCon Suite
          </p>
        </div>
      `,
    });

  return NextResponse.json({
    ok: true,
    emailSent:
      result.sent,
    emailError:
      result.sent
        ? undefined
        : result.error ??
          "The uploader could not be emailed.",
  });
}
