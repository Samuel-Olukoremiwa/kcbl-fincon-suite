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
    params: {
      reportid: string;
    };
  },
) {
  const viewer = await getViewer();

  const {
    decision,
    comments,
  } = await request.json();

  if (
    !canManageProjectReports(
      viewer,
    ) &&
    viewer.roleName !==
      "Super User"
  ) {
    return NextResponse.json(
      {
        error:
          "Only MD Office may review and authorize a Project Manager Progress Report.",
      },
      { status: 403 },
    );
  }

  if (
    decision !==
      "Authorized" &&
    decision !==
      "Rejected"
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid decision.",
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
    decision ===
      "Rejected" &&
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
        reviewstatus,
        reporttype,
        progresspct,
        projectid,
        reportweek,
        uploadedbyuserid
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
          "Progress Report not found.",
      },
      { status: 404 },
    );
  }

  if (
    report.reporttype !==
    "Project Manager"
  ) {
    return NextResponse.json(
      {
        error:
          "Only Project Manager Progress Reports are reviewed by MD Office.",
      },
      { status: 400 },
    );
  }

  if (
    ![
      "Submitted",
      "Reviewed",
    ].includes(
      report.reviewstatus,
    ) ||
    report.progresspct ===
      null
  ) {
    return NextResponse.json(
      {
        error:
          "This Project Manager Progress Report is not awaiting MD Office review or does not contain a progress percentage.",
      },
      { status: 400 },
    );
  }

  const {
    error: updateError,
  } = await admin
    .from("projectreports")
    .update({
      reviewstatus:
        decision,
      authorizedbyuserid:
        viewer.userId,
      authorizedat:
        new Date().toISOString(),
      authorizationcomments:
        trimmedComments ||
        null,
    })
    .eq(
      "reportid",
      params.reportid,
    )
    .in(
      "reviewstatus",
      [
        "Submitted",
        "Reviewed",
      ],
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

  let uploaderEmailSent =
    false;

  let clientEmailSent =
    false;

  let emailError:
    | string
    | undefined;

  const {
    data: project,
  } = await admin
    .from("projects")
    .select(
      `
        projecttitle,
        clients!inner(
          fullnameorcompanyname,
          email
        )
      `,
    )
    .eq(
      "projectid",
      report.projectid,
    )
    .maybeSingle();

  const client =
    project?.clients as unknown as {
      fullnameorcompanyname:
        string;
      email:
        string | null;
    } | null;

  if (
    decision ===
    "Rejected"
  ) {
    const {
      data: uploader,
    } = await admin
      .from("users")
      .select(
        "email,fullname",
      )
      .eq(
        "userid",
        report.uploadedbyuserid,
      )
      .maybeSingle();

    const uploaderEmail =
      typeof uploader?.email ===
      "string"
        ? uploader.email.trim()
        : "";

    if (!uploaderEmail) {
      emailError =
        "The uploader does not have an email address.";
    } else {
      const result =
        await sendProjectReportEmail({
          to: uploaderEmail,

          subject:
            `Project Manager Progress Report rejected by MD Office: ${
              project?.projecttitle ??
              report.projectid
            }`,

          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b;">
              <h2>Progress Report Rejected</h2>

              <p>
                Hello ${uploader?.fullname ?? ""},
              </p>

              <p>
                Your Project Manager Progress Report for
                <strong>
                  ${project?.projecttitle ?? report.projectid}
                </strong>
                for the week of
                <strong>${report.reportweek}</strong>
                was rejected by MD Office.
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

      uploaderEmailSent =
        result.sent;

      if (!result.sent) {
        emailError =
          result.error ??
          "The uploader could not be emailed.";
      }
    }
  }

  if (
    decision ===
      "Authorized"
  ) {
    if (!client?.email) {
      emailError =
        "The client does not have an email address.";
    } else {
      const result =
        await sendProjectReportEmail({
          to: client.email,

          subject:
            `Your project progress report is available: ${
              project?.projecttitle ??
              report.projectid
            }`,

          html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b;">
              <h2>Progress Report Available</h2>

              <p>
                Hello ${client.fullnameorcompanyname},
              </p>

              <p>
                The authorized weekly Progress Report for
                <strong>
                  ${project?.projecttitle ?? report.projectid}
                </strong>
                is now available in your secure FinCon Suite project portal.
              </p>

              <p>
                Please sign in to view or download the PDF and approved report media.
              </p>

              <p>
                Regards,<br />
                KCBL FinCon Suite
              </p>
            </div>
          `,
        });

      clientEmailSent =
        result.sent;

      if (!result.sent) {
        emailError =
          result.error ??
          "The client could not be emailed.";
      }

      if (result.sent) {
        await admin
          .from(
            "projectreportnotifications",
          )
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
          .from(
            "projectreports",
          )
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
  }

  return NextResponse.json({
    ok: true,
    emailSent:
      decision ===
      "Rejected"
        ? uploaderEmailSent
        : clientEmailSent,
    emailError,
  });
}
