import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  MAX_REPORT_BYTES,
  REPORT_BUCKET,
  validReportWeek,
} from "@/lib/project-reports";
import { sendProjectReportEmail } from "@/lib/mailer";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (viewer.userType !== "Staff" || viewer.department !== "Operations")
    return NextResponse.json(
      {
        error:
          "Only assigned Operations staff may complete a Progress Report upload.",
      },
      { status: 403 },
    );
  const { projectid, reportweek, filename, filesize, storagepath } =
    await request.json();
  if (
    !projectid ||
    !validReportWeek(reportweek) ||
    typeof filename !== "string" ||
    !filename.toLowerCase().endsWith(".pdf") ||
    !Number.isInteger(filesize) ||
    filesize < 1 ||
    filesize > MAX_REPORT_BYTES ||
    typeof storagepath !== "string" ||
    !storagepath.startsWith(`${projectid}/${reportweek}/`)
  ) {
    return NextResponse.json(
      { error: "Invalid report upload details." },
      { status: 400 },
    );
  }
  const admin = createAdminClient();
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
  const { data: report, error } = await admin
    .from("projectreports")
    .insert({
      projectid,
      reportweek,
      filename,
      filesize,
      storagepath,
      uploadedbyuserid: viewer.userId,
    })
    .select("reportid")
    .single();
  if (error) {
    await admin.storage.from(REPORT_BUCKET).remove([storagepath]);
    return NextResponse.json(
      {
        error:
          error.code === "23505"
            ? "A report for this project and week already exists."
            : error.message,
      },
      { status: 400 },
    );
  }
  // Send immediately after the metadata is committed, so a failed email never
  // loses an uploaded report. The notification log prevents the scheduler
  // from sending a duplicate message later.
  const { data: project } = await admin
    .from("projects")
    .select("projecttitle,clients!inner(fullnameorcompanyname,email)")
    .eq("projectid", projectid)
    .maybeSingle();
  const client = project?.clients as unknown as {
    fullnameorcompanyname: string;
    email: string | null;
  } | null;
  const notificationKey = `CLIENT_REPORT_AVAILABLE:${report.reportid}`;
  let emailSent = false;
  if (client?.email) {
    const result = await sendProjectReportEmail({
      to: client.email,
      subject: `Your project report is available: ${project?.projecttitle ?? projectid}`,
      html: `<p>Hello ${client.fullnameorcompanyname},</p><p>Your weekly Progress Report for <strong>${project?.projecttitle ?? projectid}</strong> is now available in your secure FinCon Suite project portal.</p><p>Please sign in to view or download the PDF.</p>`,
    });
    emailSent = result.sent;
    if (result.sent) {
      await admin.from("projectreportnotifications").insert({
        notificationkey: notificationKey,
        eventtype: "CLIENT_REPORT_AVAILABLE",
        reportweek,
        reportid: report.reportid,
        recipientemail: client.email,
      });
      await admin
        .from("projectreports")
        .update({ clientnotifiedat: new Date().toISOString() })
        .eq("reportid", report.reportid);
    }
  }
  return NextResponse.json(
    {
      ok: true,
      emailSent,
      emailMessage: emailSent
        ? "Client notified immediately."
        : "Report uploaded. Client email could not be sent; verify the client email and Resend setup.",
    },
    { status: 201 },
  );
}
