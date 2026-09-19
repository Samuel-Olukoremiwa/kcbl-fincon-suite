import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendProjectReportEmail } from "@/lib/mailer";

export async function PATCH(
  request: Request,
  { params }: { params: { reportid: string } }
) {
  const viewer = await getViewer();

  const { progresspct, comments, decision } = await request.json();

  if (viewer.department !== "Operations") {
    return NextResponse.json(
      {
        error: "Only Operations may review a progress report.",
      },
      { status: 403 }
    );
  }

  const progress = Number(progresspct);

  if (
    !Number.isFinite(progress) ||
    progress < 0 ||
    progress > 100
  ) {
    return NextResponse.json(
      {
        error:
          "Progress percentage between 0 and 100 is required.",
      },
      { status: 400 }
    );
  }

  if (decision !== "Reviewed" && decision !== "Rejected") {
    return NextResponse.json(
      {
        error: "Invalid review decision.",
      },
      { status: 400 }
    );
  }

  const trimmedComments =
    typeof comments === "string" ? comments.trim() : "";

  if (decision === "Rejected" && !trimmedComments) {
    return NextResponse.json(
      {
        error: "A rejection reason is required.",
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  /*
   * Find the report.
   */
  const {
    data: report,
    error: reportError,
  } = await admin
    .from("projectreports")
    .select(
      "projectid,reviewstatus,reportweek,uploadedbyuserid,filename"
    )
    .eq("reportid", params.reportid)
    .maybeSingle();

  if (reportError) {
    console.error(
      "Failed to fetch project report:",
      reportError
    );

    return NextResponse.json(
      {
        error: reportError.message,
      },
      { status: 500 }
    );
  }

  if (!report) {
    return NextResponse.json(
      {
        error: "Progress Report not found.",
      },
      { status: 404 }
    );
  }

  if (report.reviewstatus !== "Submitted") {
    return NextResponse.json(
      {
        error:
          "Report is not awaiting supervisor review.",
      },
      { status: 400 }
    );
  }

  /*
   * Verify that the current Operations user
   * is an approved supervisor for this project.
   */
  const {
    data: assignment,
    error: assignmentError,
  } = await admin
    .from("projectassignments")
    .select("assignmentid")
    .eq("projectid", report.projectid)
    .eq("userid", viewer.userId)
    .eq("approvalstatus", "Approved")
    .eq("active", true)
    .in("assignmentrole", [
      "Project Manager",
      "Senior Supervisor",
      "Junior Supervisor",
    ])
    .maybeSingle();

  if (assignmentError) {
    console.error(
      "Failed to verify supervisor assignment:",
      assignmentError
    );

    return NextResponse.json(
      {
        error: assignmentError.message,
      },
      { status: 500 }
    );
  }

  if (!assignment) {
    return NextResponse.json(
      {
        error:
          "You are not an approved supervisor for this project.",
      },
      { status: 403 }
    );
  }

  /*
   * Determine the new report status.
   */
  const nextStatus =
    decision === "Rejected"
      ? "Rejected"
      : "Reviewed";

  /*
   * Update the report first.
   */
  const {
    error: updateError,
  } = await admin
    .from("projectreports")
    .update({
      reviewstatus: nextStatus,
      progresspct: progress,
      supervisorcomments:
        trimmedComments || null,
      supervisorreviewedbyuserid: viewer.userId,
      supervisorreviewedat:
        new Date().toISOString(),
    })
    .eq("reportid", params.reportid);

  if (updateError) {
    console.error(
      "Failed to update project report:",
      updateError
    );

    return NextResponse.json(
      {
        error: updateError.message,
      },
      { status: 400 }
    );
  }

  /*
   * A normal review does not require an email.
   */
  if (nextStatus !== "Rejected") {
    return NextResponse.json({
      ok: true,
      emailSent: false,
    });
  }

  /*
   * The report was rejected.
   *
   * Find the uploader and project so we can
   * send the rejection notification.
   */
  const [
    {
      data: uploader,
      error: uploaderError,
    },
    {
      data: project,
      error: projectError,
    },
  ] = await Promise.all([
    admin
      .from("users")
      .select("email,fullname")
      .eq(
        "userid",
        report.uploadedbyuserid
      )
      .maybeSingle(),

    admin
      .from("projects")
      .select("projecttitle")
      .eq(
        "projectid",
        report.projectid
      )
      .maybeSingle(),
  ]);

  /*
   * If the uploader lookup itself failed,
   * the report remains rejected but the
   * email cannot be sent.
   */
  if (uploaderError) {
    console.error(
      "Failed to find report uploader:",
      uploaderError
    );

    return NextResponse.json({
      ok: true,
      emailSent: false,
      emailError:
        "Could not find the report uploader.",
    });
  }

  if (projectError) {
    console.error(
      "Failed to find project:",
      projectError
    );
  }

  /*
   * Make sure the uploader has an email address.
   */
  const uploaderEmail =
    typeof uploader?.email === "string"
      ? uploader.email.trim()
      : "";

  if (!uploaderEmail) {
    console.error(
      "Uploader has no email address:",
      report.uploadedbyuserid
    );

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

  /*
   * Send the rejection email through Resend.
   */
  const result =
    await sendProjectReportEmail({
      to: uploaderEmail,

      subject:
        `Progress Report rejected at supervisor review: ${projectTitle}`,

      html: `
        <div
          style="
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #1e293b;
          "
        >
          <h2>
            Progress Report Rejected
          </h2>

          <p>
            Hello
            ${uploader?.fullname ?? ""},
          </p>

          <p>
            Your Progress Report for
            <strong>${projectTitle}</strong>
            for the week of
            <strong>${report.reportweek}</strong>
            was rejected during supervisor review.
          </p>

          <p>
            <strong>Reason for rejection:</strong>
          </p>

          <div
            style="
              padding: 12px;
              background: #f8fafc;
              border-left: 4px solid #dc2626;
              margin: 12px 0;
            "
          >
            ${trimmedComments}
          </div>

          <p>
            Please review the rejection reason and
            resubmit a corrected Progress Report.
          </p>

          <p>
            Regards,<br />
            KCBL FinCon Suite
          </p>
        </div>
      `,
    });

  /*
   * The report is already rejected at this point.
   * Do NOT undo the rejection if the email fails.
   *
   * Instead, tell the frontend exactly why the
   * email could not be sent.
   */
  if (!result.sent) {
    console.error(
      "Progress report was rejected, but the email failed:",
      result.error
    );

    return NextResponse.json({
      ok: true,
      emailSent: false,
      emailError:
        result.error ??
        "The uploader could not be emailed.",
    });
  }

  /*
   * Everything succeeded.
   */
  return NextResponse.json({
    ok: true,
    emailSent: true,
  });
}