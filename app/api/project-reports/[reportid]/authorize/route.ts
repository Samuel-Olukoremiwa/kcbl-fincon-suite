import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendProjectReportEmail } from "@/lib/mailer";

export async function PATCH(
  request: Request,
  { params }: { params: { reportid: string } },
) {
  const viewer = await getViewer();

  const { decision, comments } = await request.json();

  if (
    viewer.department !== "MD Office" &&
    viewer.roleName !== "Super User"
  ) {
    return NextResponse.json(
      {
        error:
          "Only MD Office may authorize a reviewed progress report.",
      },
      { status: 403 },
    );
  }

  if (
    decision !== "Authorized" &&
    decision !== "Rejected"
  ) {
    return NextResponse.json(
      {
        error: "Invalid decision.",
      },
      { status: 400 },
    );
  }

  const trimmedComments =
    typeof comments === "string"
      ? comments.trim()
      : "";

  if (decision === "Rejected" && !trimmedComments) {
    return NextResponse.json(
      {
        error: "A rejection reason is required.",
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const {
    data: report,
    error: reportError,
  } = await admin
    .from("projectreports")
    .select(
      "reviewstatus,progresspct,projectid,reportweek,uploadedbyuserid",
    )
    .eq("reportid", params.reportid)
    .maybeSingle();

  if (reportError) {
    console.error(
      "Failed to fetch project report:",
      reportError,
    );

    return NextResponse.json(
      {
        error: reportError.message,
      },
      { status: 500 },
    );
  }

  if (!report) {
    return NextResponse.json(
      {
        error: "Progress Report not found.",
      },
      { status: 404 },
    );
  }

  /*
   * A report must first be reviewed by Operations.
   *
   * The progress percentage entered during supervisor review
   * is preserved when MD Office authorizes it.
   */
  if (
    report.reviewstatus !== "Reviewed" ||
    report.progresspct === null
  ) {
    return NextResponse.json(
      {
        error:
          "A supervisor review and progress percentage are required first.",
      },
      { status: 400 },
    );
  }

  const {
    error: updateError,
  } = await admin
    .from("projectreports")
    .update({
      /*
       * This changes Reviewed -> Authorized/Rejected.
       *
       * IMPORTANT:
       * progresspct is intentionally NOT updated here.
       *
       * Therefore an authorized report keeps exactly the percentage
       * entered during supervisor review.
       */
      reviewstatus: decision,

      authorizedbyuserid: viewer.userId,

      authorizedat: new Date().toISOString(),

      authorizationcomments:
        decision === "Rejected"
          ? trimmedComments
          : null,
    })
    .eq("reportid", params.reportid);

  if (updateError) {
    console.error(
      "Failed to authorize project report:",
      updateError,
    );

    return NextResponse.json(
      {
        error: updateError.message,
      },
      { status: 400 },
    );
  }

  let uploaderEmailSent = false;
  let clientEmailSent = false;

  const {
    data: project,
    error: projectError,
  } = await admin
    .from("projects")
    .select(
      "projecttitle,clients!inner(fullnameorcompanyname,email)",
    )
    .eq("projectid", report.projectid)
    .maybeSingle();

  if (projectError) {
    console.error(
      "Failed to fetch project/client:",
      projectError,
    );
  }

  const client = project?.clients as unknown as {
    fullnameorcompanyname: string;
    email: string | null;
  } | null;

  /*
   * If MD Office rejects the report, notify the uploader.
   */
  if (decision === "Rejected") {
    const {
      data: uploader,
      error: uploaderError,
    } = await admin
      .from("users")
      .select("email,fullname")
      .eq("userid", report.uploadedbyuserid)
      .maybeSingle();

    if (uploaderError) {
      console.error(
        "Failed to find report uploader:",
        uploaderError,
      );
    }

    const uploaderEmail =
      typeof uploader?.email === "string"
        ? uploader.email.trim()
        : "";

    if (uploaderEmail) {
      const result = await sendProjectReportEmail({
        to: uploaderEmail,

        subject:
          `Progress Report rejected at MD Office authorization: ${
            project?.projecttitle ?? report.projectid
          }`,

        html: `
          <div
            style="
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #1e293b;
            "
          >
            <h2>Progress Report Rejected</h2>

            <p>
              Hello ${uploader?.fullname ?? ""},
            </p>

            <p>
              Your Progress Report for
              <strong>
                ${project?.projecttitle ?? report.projectid}
              </strong>
              for the week of
              <strong>${report.reportweek}</strong>
              was rejected during MD Office authorization.
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
              Please review the rejection reason and resubmit
              a corrected Progress Report.
            </p>

            <p>
              Regards,<br />
              KCBL FinCon Suite
            </p>
          </div>
        `,
      });

      uploaderEmailSent = result.sent;

      if (!result.sent) {
        console.error(
          "MD Office rejection email failed:",
          result.error,
        );
      }
    }
  }

  /*
   * The client is notified ONLY after authorization.
   *
   * A Submitted, Reviewed or Rejected report does not notify
   * the client.
   */
  if (
    decision === "Authorized" &&
    client?.email
  ) {
    const notificationKey =
      `CLIENT_REPORT_AVAILABLE:${params.reportid}`;

    const result = await sendProjectReportEmail({
      to: client.email,

      subject:
        `Your project report is available: ${
          project?.projecttitle ?? report.projectid
        }`,

      html: `
        <div
          style="
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #1e293b;
          "
        >
          <h2>Progress Report Available</h2>

          <p>
            Hello ${client.fullnameorcompanyname},
          </p>

          <p>
            Your weekly Progress Report for
            <strong>
              ${project?.projecttitle ?? report.projectid}
            </strong>
            is now available in your secure FinCon Suite
            project portal.
          </p>

          <p>
            Please sign in to view or download the PDF.
          </p>

          <p>
            Regards,<br />
            KCBL FinCon Suite
          </p>
        </div>
      `,
    });

    clientEmailSent = result.sent;

    if (!result.sent) {
      console.error(
        "Client report notification email failed:",
        result.error,
      );
    }

    /*
     * Only record the notification after the email was
     * successfully sent.
     */
    if (result.sent) {
      const {
        error: notificationError,
      } = await admin
        .from("projectreportnotifications")
        .insert({
          notificationkey: notificationKey,
          eventtype: "CLIENT_REPORT_AVAILABLE",
          reportweek: report.reportweek,
          reportid: params.reportid,
          recipientemail: client.email,
        });

      if (notificationError) {
        console.error(
          "Failed to record client report notification:",
          notificationError,
        );
      }

      const {
        error: notifiedError,
      } = await admin
        .from("projectreports")
        .update({
          clientnotifiedat: new Date().toISOString(),
        })
        .eq("reportid", params.reportid);

      if (notifiedError) {
        console.error(
          "Failed to update client notification timestamp:",
          notifiedError,
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,

    emailSent:
      decision === "Rejected"
        ? uploaderEmailSent
        : clientEmailSent,
  });
}