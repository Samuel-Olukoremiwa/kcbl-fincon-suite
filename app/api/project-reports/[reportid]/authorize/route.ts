import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendProjectReportEmail } from "@/lib/mailer";
import { canManageProjectReports } from "@/lib/access";

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: { reportid: string };
  },
) {
  const viewer = await getViewer();

  const {
    decision,
    comments,
  } = await request.json();

  if (
    !canManageProjectReports(viewer) &&
    viewer.roleName !== "Super User"
  ) {
    return NextResponse.json(
      {
        error:
          "Only an MD Office Authorizer may authorize a reviewed progress report.",
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

  const admin = createAdminClient();

  const {
    data: report,
    error: reportError,
  } = await admin
    .from("projectreports")
    .select(
      `
        reviewstatus,
        progresspct,
        projectid,
        reportweek,
        uploadedbyuserid
      `,
    )
    .eq("reportid", params.reportid)
    .maybeSingle();

  if (reportError) {
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
   * Only Reviewed reports can reach MD Office.
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

  /*
   * The percentage entered during supervisor review
   * is preserved.
   */
  const {
    error: updateError,
  } = await admin
    .from("projectreports")
    .update({
      reviewstatus: decision,
      authorizedbyuserid:
        viewer.userId,
      authorizedat:
        new Date().toISOString(),
      authorizationcomments:
        decision === "Rejected"
          ? trimmedComments
          : null,
    })
    .eq("reportid", params.reportid);

  if (updateError) {
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
  } = await admin
    .from("projects")
    .select(
      "projecttitle,clients!inner(fullnameorcompanyname,email)",
    )
    .eq("projectid", report.projectid)
    .maybeSingle();

  const client =
    project?.clients as unknown as {
      fullnameorcompanyname: string;
      email: string | null;
    } | null;

  /*
   * MD Office rejection -> uploader notification.
   */
  if (decision === "Rejected") {
    const {
      data: uploader,
    } = await admin
      .from("users")
      .select("email,fullname")
      .eq(
        "userid",
        report.uploadedbyuserid,
      )
      .maybeSingle();

    const uploaderEmail =
      typeof uploader?.email === "string"
        ? uploader.email.trim()
        : "";

    if (uploaderEmail) {
      const result =
        await sendProjectReportEmail({
          to: uploaderEmail,

          subject:
            `Progress Report rejected at MD Office authorization: ${
              project?.projecttitle ??
              report.projectid
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

      uploaderEmailSent = result.sent;
    }
  }

  /*
   * ONLY Authorized reports notify the client.
   */
  if (
    decision === "Authorized" &&
    client?.email
  ) {
    const result =
      await sendProjectReportEmail({
        to: client.email,

        subject:
          `Your project report is available: ${
            project?.projecttitle ??
            report.projectid
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

    /*
     * Record notification only after successful delivery.
     */
    if (result.sent) {
      await admin
        .from("projectreportnotifications")
        .insert({
          notificationkey:
            `CLIENT_REPORT_AVAILABLE:${params.reportid}`,
          eventtype:
            "CLIENT_REPORT_AVAILABLE",
          reportweek:
            report.reportweek,
          reportid:
            params.reportid,
          recipientemail:
            client.email,
        });

      await admin
        .from("projectreports")
        .update({
          clientnotifiedat:
            new Date().toISOString(),
        })
        .eq(
          "reportid",
          params.reportid,
        );
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