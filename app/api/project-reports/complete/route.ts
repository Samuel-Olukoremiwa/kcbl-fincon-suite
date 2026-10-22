import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendProjectReportEmail } from "@/lib/mailer";
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
          "Only assigned Operations staff may complete a project report upload.",
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
    storagepath,
    progresspct,
    supersedesreportid,
  } = await request.json();

  if (
    !projectid ||
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

  if (reporttype === "Project Manager" ? !validReportWeek(reportweek) : !validReportDate(reportdate) || reportweek !== weekStartForDate(reportdate)) {
    await admin.storage.from(REPORT_BUCKET).remove([storagepath]);
    return NextResponse.json({ error: "Invalid reporting week or daily report date." }, { status: 400 });
  }

  let revisedReportId: number | null = null;
  if (supersedesreportid !== null && supersedesreportid !== undefined) {
    if (!Number.isSafeInteger(supersedesreportid) || supersedesreportid < 1) {
      return NextResponse.json({error:"Invalid report to revise."},{status:400});
    }
    const {data: prior, error: priorError} = await admin.from("projectreports")
      .select("reportid,projectid,reporttype,reportweek,reportdate,reviewstatus,uploadedbyuserid")
      .eq("reportid",supersedesreportid).maybeSingle();
    if (priorError || !prior || prior.reviewstatus !== "Rejected" ||
        prior.projectid !== projectid || prior.reporttype !== reporttype ||
        prior.uploadedbyuserid !== viewer.userId || prior.reportweek !== reportweek ||
        (reporttype === "Operations" && prior.reportdate !== reportdate)) {
      return NextResponse.json({error:"You may only revise your own rejected report for the same project and reporting period."},{status:403});
    }
    revisedReportId = prior.reportid;
  }

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
      reportdate: reporttype === "Project Manager" ? null : reportdate,
      reporttype,
      supersedesreportid: revisedReportId,
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

  // Mail is best-effort: report submission must remain successful if mail fails.
  let notificationSent = false;
  let notificationError: string | undefined;
  const [{ data: project }, { data: uploader }] = await Promise.all([
    admin.from("projects").select("projecttitle").eq("projectid",projectid).maybeSingle(),
    admin.from("users").select("fullname").eq("userid",viewer.userId).maybeSingle(),
  ]);
  let recipients: string[] = [];
  if (reporttype === "Operations") {
    const {data: managers} = await admin.from("projectassignments").select("userid")
      .eq("projectid",projectid).eq("assignmentrole","Project Manager")
      .eq("approvalstatus","Approved").eq("active",true);
    const ids = [...new Set((managers ?? []).map((item) => item.userid))];
    if(ids.length){const {data: people} = await admin.from("users").select("email").in("userid",ids);
      recipients = (people ?? []).map((item)=>item.email).filter((email): email is string=>typeof email === "string" && email.includes("@"));}
  } else {
    const {data: people} = await admin.from("users").select("email").eq("department","MD Office").eq("status","Active");
    recipients = (people ?? []).map((item)=>item.email).filter((email): email is string=>typeof email === "string" && email.includes("@"));
  }
  if (!recipients.length) notificationError = "No active reviewer email address found.";
  else {
    const label = reporttype === "Operations" ? `Daily report (${reportdate})` : `Weekly report (${reportweek})`;
    const escape = (v: string) => v.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const results = await Promise.all(recipients.map((to) => sendProjectReportEmail({
      to, subject: `New ${label} awaiting review: ${project?.projecttitle ?? projectid}`,
      html: `<p>A ${escape(label)} has been submitted for <strong>${escape(project?.projecttitle ?? projectid)}</strong> by ${escape(uploader?.fullname ?? "a team member")}.</p><p>Report #${report.reportid} is awaiting your review. Log in to the portal and open Project Reports.</p>`,
    })));
    notificationSent = results.every((r) => r.sent);
    if (!notificationSent) notificationError = results.filter((r)=>!r.sent).map((r)=>r.error ?? "Email failed").join("; ");
  }

  return NextResponse.json(
    {
      notificationSent,
      notificationError,
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
          : "Daily Operations Report uploaded and sent to the Project Manager for review.",
    },
    { status: 201 },
  );
}
