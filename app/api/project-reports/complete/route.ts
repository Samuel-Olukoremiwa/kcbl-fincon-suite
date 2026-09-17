import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageProjectReports } from "@/lib/access";
import { MAX_REPORT_BYTES, REPORT_BUCKET, validReportMonth } from "@/lib/project-reports";
import { sendProjectReportEmail } from "@/lib/mailer";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!canManageProjectReports(viewer)) return NextResponse.json({ error: "Only MD Office may complete a report upload." }, { status: 403 });
  const { projectid, reportmonth, filename, filesize, storagepath } = await request.json();
  if (!projectid || !validReportMonth(reportmonth) || typeof filename !== "string" || !filename.toLowerCase().endsWith(".pdf") || !Number.isInteger(filesize) || filesize < 1 || filesize > MAX_REPORT_BYTES || typeof storagepath !== "string" || !storagepath.startsWith(`${projectid}/${reportmonth}/`)) {
    return NextResponse.json({ error: "Invalid report upload details." }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data: report, error } = await admin.from("projectreports").insert({ projectid, reportmonth, filename, filesize, storagepath, uploadedbyuserid: viewer.userId }).select("reportid").single();
  if (error) {
    await admin.storage.from(REPORT_BUCKET).remove([storagepath]);
    return NextResponse.json({ error: error.code === "23505" ? "A report for this project and month already exists." : error.message }, { status: 400 });
  }
  // Send immediately after the metadata is committed, so a failed email never
  // loses an uploaded report. The notification log prevents the scheduler
  // from sending a duplicate message later.
  const { data: project } = await admin.from("projects").select("projecttitle,clients!inner(fullnameorcompanyname,email)").eq("projectid", projectid).maybeSingle();
  const client = project?.clients as unknown as { fullnameorcompanyname: string; email: string | null } | null;
  const notificationKey = `CLIENT_REPORT_AVAILABLE:${report.reportid}`;
  let emailSent = false;
  if (client?.email) {
    const result = await sendProjectReportEmail({
      to: client.email,
      subject: `Your project report is available: ${project?.projecttitle ?? projectid}`,
      html: `<p>Hello ${client.fullnameorcompanyname},</p><p>Your monthly report for <strong>${project?.projecttitle ?? projectid}</strong> is now available in your secure FinCon Suite project portal.</p><p>Please sign in to view or download the PDF.</p>`,
    });
    emailSent = result.sent;
    if (result.sent) {
      await admin.from("projectreportnotifications").insert({ notificationkey: notificationKey, eventtype: "CLIENT_REPORT_AVAILABLE", reportmonth, reportid: report.reportid, recipientemail: client.email });
      await admin.from("projectreports").update({ clientnotifiedat: new Date().toISOString() }).eq("reportid", report.reportid);
    }
  }
  return NextResponse.json({ ok: true, emailSent, emailMessage: emailSent ? "Client notified immediately." : "Report uploaded. Client email could not be sent; verify the client email and Resend setup." }, { status: 201 });
}
