import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendProjectReportEmail } from "@/lib/mailer";

export async function PATCH(request: Request, { params }: { params: { reportid: string } }) {
  const viewer = await getViewer();
  const { decision, comments } = await request.json();

  if (viewer.department !== "MD Office" && viewer.roleName !== "Super User") {
    return NextResponse.json({ error: "Only MD Office may authorize a reviewed progress report." }, { status: 403 });
  }
  if (!["Authorized", "Rejected"].includes(decision)) {
    return NextResponse.json({ error: "Invalid decision." }, { status: 400 });
  }
  if (decision === "Rejected" && !comments) {
    return NextResponse.json({ error: "A rejection reason is required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: report } = await admin
    .from("projectreports")
    .select("reviewstatus,progresspct,projectid,reportweek,uploadedbyuserid")
    .eq("reportid", params.reportid)
    .maybeSingle();

  if (!report || report.reviewstatus !== "Reviewed" || report.progresspct === null) {
    return NextResponse.json({ error: "A supervisor review and progress percentage are required first." }, { status: 400 });
  }

  const { error } = await admin
    .from("projectreports")
    .update({
      reviewstatus: decision,
      authorizedbyuserid: viewer.userId,
      authorizedat: new Date().toISOString(),
      authorizationcomments: decision === "Rejected" ? comments : null,
    })
    .eq("reportid", params.reportid);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  let uploaderEmailSent = false;
  let clientEmailSent = false;

  const { data: project } = await admin
    .from("projects")
    .select("projecttitle,clients!inner(fullnameorcompanyname,email)")
    .eq("projectid", report.projectid)
    .maybeSingle();
  const client = project?.clients as unknown as {
    fullnameorcompanyname: string;
    email: string | null;
  } | null;

  if (decision === "Rejected") {
    const { data: uploader } = await admin
      .from("users")
      .select("email,fullname")
      .eq("userid", report.uploadedbyuserid)
      .maybeSingle();

    if (uploader?.email) {
      const result = await sendProjectReportEmail({
        to: uploader.email,
        subject: `Progress Report rejected at MD Office authorization: ${project?.projecttitle ?? report.projectid}`,
        html: `<p>Hello ${uploader.fullname ?? ""},</p><p>Your Progress Report for <strong>${project?.projecttitle ?? report.projectid}</strong> (week of ${report.reportweek}) was rejected at MD Office authorization.</p><p><strong>Reason:</strong> ${comments}</p><p>Please review and resubmit a corrected report.</p>`,
      });
      uploaderEmailSent = result.sent;
    }
  }

  // The client is notified only now — once the report has cleared both
  // supervisor review and MD Office authorization.
  if (decision === "Authorized" && client?.email) {
    const notificationKey = `CLIENT_REPORT_AVAILABLE:${params.reportid}`;
    const result = await sendProjectReportEmail({
      to: client.email,
      subject: `Your project report is available: ${project?.projecttitle ?? report.projectid}`,
      html: `<p>Hello ${client.fullnameorcompanyname},</p><p>Your weekly Progress Report for <strong>${project?.projecttitle ?? report.projectid}</strong> is now available in your secure FinCon Suite project portal.</p><p>Please sign in to view or download the PDF.</p>`,
    });
    clientEmailSent = result.sent;
    if (result.sent) {
      await admin.from("projectreportnotifications").insert({
        notificationkey: notificationKey,
        eventtype: "CLIENT_REPORT_AVAILABLE",
        reportweek: report.reportweek,
        reportid: params.reportid,
        recipientemail: client.email,
      });
      await admin
        .from("projectreports")
        .update({ clientnotifiedat: new Date().toISOString() })
        .eq("reportid", params.reportid);
    }
  }

  return NextResponse.json({
    ok: true,
    emailSent: decision === "Rejected" ? uploaderEmailSent : clientEmailSent,
  });
}