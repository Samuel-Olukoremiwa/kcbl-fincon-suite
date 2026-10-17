import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiWriteAccess } from "@/lib/viewer";
import { nextPrefixedId } from "@/lib/client-utils";
import { canCreateClientOrProject } from "@/lib/access";

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export async function POST(request: Request) {
  const { viewer, forbidden } =
    await requireApiWriteAccess("projects");

  if (
    forbidden ||
    !viewer ||
    !canCreateClientOrProject(viewer)
  ) {
    return NextResponse.json(
      { error: "Not authorized to create projects." },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const clientid = normalizeText(body.clientid);
  const title = normalizeText(body.title);
  const location = normalizeText(body.location);
  const type = normalizeText(body.type);
  const value = Number(body.value);
  const start = normalizeText(body.start);
  const end = normalizeText(body.end);
  const manager = normalizeText(body.manager);

  if (!clientid) {
    return NextResponse.json(
      { error: "Select a client." },
      { status: 400 },
    );
  }

  if (!title) {
    return NextResponse.json(
      { error: "Project title is required." },
      { status: 400 },
    );
  }

  if (!location) {
    return NextResponse.json(
      { error: "Project location is required." },
      { status: 400 },
    );
  }

  if (
    ![
      "Residential",
      "Commercial",
      "Institutional",
      "Other",
    ].includes(type)
  ) {
    return NextResponse.json(
      { error: "Select a valid project type." },
      { status: 400 },
    );
  }

  if (!Number.isFinite(value) || value <= 0) {
    return NextResponse.json(
      {
        error:
          "Estimated project value must be greater than zero.",
      },
      { status: 400 },
    );
  }

  if (start && end && end < start) {
    return NextResponse.json(
      {
        error:
          "Expected end date cannot be earlier than the start date.",
      },
      { status: 400 },
    );
  }

  if (!manager) {
    return NextResponse.json(
      {
        error:
          "A Project Manager must be selected when the project is created.",
      },
      { status: 400 },
    );
  }

  const supabase = createClient();
  const admin = createAdminClient();

  const [
    { data: client, error: clientError },
    { data: managerUser, error: managerError },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("clientid")
      .eq("clientid", clientid)
      .maybeSingle(),

    admin
      .from("users")
      .select("userid,usertype,status,fullname")
      .eq("userid", manager)
      .maybeSingle(),
  ]);

  if (clientError) {
    return NextResponse.json(
      { error: "Could not verify the selected client." },
      { status: 400 },
    );
  }

  if (!client) {
    return NextResponse.json(
      { error: "Client not found." },
      { status: 404 },
    );
  }

  if (managerError || !managerUser) {
    return NextResponse.json(
      {
        error:
          "The selected Project Manager could not be found.",
      },
      { status: 400 },
    );
  }

  if (
    managerUser.usertype !== "Staff" ||
    managerUser.status !== "Active"
  ) {
    return NextResponse.json(
      {
        error:
          "The selected Project Manager must be an active staff user.",
      },
      { status: 400 },
    );
  }

  const {
    data: existingClientProjects,
    error: duplicateCheckError,
  } = await supabase
    .from("projects")
    .select("projectid,projecttitle,projectlocation")
    .eq("clientid", clientid);

  if (duplicateCheckError) {
    return NextResponse.json(
      {
        error:
          "Could not check existing projects. Please try again.",
      },
      { status: 400 },
    );
  }

  const normalizedTitle = title.toLowerCase();
  const normalizedLocation = location.toLowerCase();

  const duplicateProject =
    (existingClientProjects ?? []).find(
      (project) =>
        normalizeText(project.projecttitle).toLowerCase() ===
          normalizedTitle &&
        normalizeText(project.projectlocation).toLowerCase() ===
          normalizedLocation,
    );

  if (duplicateProject) {
    return NextResponse.json(
      {
        error:
          `This project already exists as ${duplicateProject.projectid}. ` +
          "A client cannot have more than one project with the same title and location.",
        projectid: duplicateProject.projectid,
      },
      { status: 409 },
    );
  }

  const {
    data: existingProjects,
    error: existingError,
  } = await supabase
    .from("projects")
    .select("projectid");

  if (existingError) {
    return NextResponse.json(
      { error: "Could not generate the project code." },
      { status: 400 },
    );
  }

  const projectid = nextPrefixedId(
    (existingProjects ?? []).map(
      (project) => project.projectid,
    ),
    "PRJ",
    3,
  );

  const { error: insertError } =
    await supabase
      .from("projects")
      .insert({
        projectid,
        clientid,
        projecttitle: title,
        projectlocation: location,
        projecttype: type,
        estimatedvalue: value,
        startdate: start || null,
        expectedenddate: end || null,
        status: "Pending",
        projectmanageruserid: manager,
        datecreated: new Date()
          .toISOString()
          .slice(0, 10),
      });

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json(
        {
          error:
            "A duplicate project was detected. Refresh and try again.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: insertError.message },
      { status: 400 },
    );
  }

  /*
   * The Project Manager is selected at project creation so every
   * project starts with a named manager. The assignment itself is
   * Pending until MD Office reviews and approves it.
   */
  const {
    error: managerAssignmentError,
  } = await admin
    .from("projectassignments")
    .insert({
      projectid,
      userid: manager,
      assignmentrole: "Project Manager",
      assignedbyuserid: viewer.userId,
      approvalstatus: "Pending",
      authorizedbyuserid: null,
      authorizedat: null,
      active: false,
    });

  if (managerAssignmentError) {
    await admin
      .from("projects")
      .delete()
      .eq("projectid", projectid);

    return NextResponse.json(
      {
        error:
          `Project Manager assignment failed: ${managerAssignmentError.message}`,
      },
      { status: 400 },
    );
  }

  const { error: auditError } =
    await supabase
      .from("makercheckerauditlog")
      .insert({
        logid:
          `LOG${Date.now()
            .toString()
            .slice(-9)}`,
        transactiontype: "Project",
        transactionid: projectid,
        actiontype: "Created",
        actionbyuserid: viewer.userId,
        actiondate: new Date()
          .toISOString()
          .slice(0, 10),
        actiontime: new Date()
          .toTimeString()
          .slice(0, 8),
        comments:
          `${title} · Project Manager selected: ${managerUser.fullname} · awaiting MD Office assignment approval`,
      });

  if (auditError) {
    console.error(
      "Project audit log failed:",
      auditError,
    );
  }

  return NextResponse.json(
    {
      projectid,
      manageruserid: manager,
      message:
        "Project created. The Project Manager assignment is awaiting MD Office approval.",
    },
    { status: 201 },
  );
}

export async function PATCH(request: Request) {
  const { viewer, forbidden } =
    await requireApiWriteAccess("projects");

  const canAuthorizeStatus =
    viewer?.roleName === "Super User" ||
    (
      viewer?.department === "MD Office" &&
      ["Authorizer", "MD Office"].includes(
        viewer.roleName,
      )
    );

  if (
    forbidden ||
    !viewer ||
    !canAuthorizeStatus
  ) {
    return NextResponse.json(
      {
        error:
          "Only an MD Office Authorizer or Super User may authorize a project status change.",
      },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const projectid = normalizeText(body.projectid);
  const status = normalizeText(body.status);

  const allowedStatuses = [
    "Ongoing",
    "Completed",
    "On Hold",
    "Pending",
  ];

  if (
    !projectid ||
    !allowedStatuses.includes(status)
  ) {
    return NextResponse.json(
      {
        error:
          "Choose a valid project status.",
      },
      { status: 400 },
    );
  }

  const supabase = createClient();

  const {
    data: project,
    error: projectError,
  } = await supabase
    .from("projects")
    .select("projectid,status")
    .eq("projectid", projectid)
    .maybeSingle();

  if (projectError || !project) {
    return NextResponse.json(
      { error: "Project not found." },
      { status: 404 },
    );
  }

  if (project.status === status) {
    return NextResponse.json({ ok: true });
  }

  const { error: updateError } =
    await supabase
      .from("projects")
      .update({ status })
      .eq("projectid", projectid);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 400 },
    );
  }

  await supabase
    .from("makercheckerauditlog")
    .insert({
      logid:
        `LOG${Date.now()
          .toString()
          .slice(-9)}`,
      transactiontype: "Project",
      transactionid: projectid,
      actiontype: "Status Updated",
      actionbyuserid: viewer.userId,
      actiondate: new Date()
        .toISOString()
        .slice(0, 10),
      actiontime: new Date()
        .toTimeString()
        .slice(0, 8),
      comments:
        `Status changed from ${project.status} to ${status}`,
    });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { viewer, forbidden } =
    await requireApiWriteAccess("projects");

  if (forbidden || !viewer) {
    return NextResponse.json(
      { error: "Not authorized to delete projects." },
      { status: 403 },
    );
  }

  if (viewer.roleName !== "Super User") {
    return NextResponse.json(
      {
        error:
          "Only a Super User can permanently delete a project.",
      },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const projectid = normalizeText(body.projectid);

  if (!projectid) {
    return NextResponse.json(
      { error: "Project ID is required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const {
    data: project,
    error: projectError,
  } = await admin
    .from("projects")
    .select(
      "projectid,projecttitle,clientid,status",
    )
    .eq("projectid", projectid)
    .maybeSingle();

  if (projectError) {
    return NextResponse.json(
      { error: projectError.message },
      { status: 400 },
    );
  }

  if (!project) {
    return NextResponse.json(
      { error: "Project not found." },
      { status: 404 },
    );
  }

  const [
    inflowResult,
    outflowResult,
    reportResult,
    assignmentResult,
  ] = await Promise.all([
    admin
      .from("cashinflowreceivables")
      .select("transactionid", {
        count: "exact",
        head: true,
      })
      .eq("projectid", projectid),

    admin
      .from("cashoutflowexpenditure")
      .select("transactionid", {
        count: "exact",
        head: true,
      })
      .eq("projectid", projectid),

    admin
      .from("projectreports")
      .select("reportid", {
        count: "exact",
        head: true,
      })
      .eq("projectid", projectid),

    admin
      .from("projectassignments")
      .select("projectid", {
        count: "exact",
        head: true,
      })
      .eq("projectid", projectid),
  ]);

  const dependencyError =
    inflowResult.error ||
    outflowResult.error ||
    reportResult.error ||
    assignmentResult.error;

  if (dependencyError) {
    return NextResponse.json(
      {
        error:
          `Could not verify project dependencies: ${dependencyError.message}`,
      },
      { status: 400 },
    );
  }

  const inflowCount = inflowResult.count ?? 0;
  const outflowCount = outflowResult.count ?? 0;
  const reportCount = reportResult.count ?? 0;
  const assignmentCount =
    assignmentResult.count ?? 0;

  if (
    inflowCount > 0 ||
    outflowCount > 0 ||
    reportCount > 0 ||
    assignmentCount > 0
  ) {
    const reasons: string[] = [];

    if (inflowCount > 0) {
      reasons.push(`${inflowCount} cash inflow record(s)`);
    }

    if (outflowCount > 0) {
      reasons.push(`${outflowCount} expenditure record(s)`);
    }

    if (reportCount > 0) {
      reasons.push(`${reportCount} progress report(s)`);
    }

    if (assignmentCount > 0) {
      reasons.push(`${assignmentCount} staff assignment(s)`);
    }

    return NextResponse.json(
      {
        error:
          `This project cannot be permanently deleted because it has ${reasons.join(
            ", ",
          )}. Use the normal project completion/archive process instead.`,
      },
      { status: 409 },
    );
  }

  const { error: deleteError } =
    await admin
      .from("projects")
      .delete()
      .eq("projectid", projectid);

  if (deleteError) {
    return NextResponse.json(
      { error: deleteError.message },
      { status: 400 },
    );
  }

  await admin
    .from("makercheckerauditlog")
    .insert({
      logid:
        `LOG${Date.now()
          .toString()
          .slice(-9)}`,
      transactiontype: "Project",
      transactionid: projectid,
      actiontype: "Deleted",
      actionbyuserid: viewer.userId,
      actiondate: new Date()
        .toISOString()
        .slice(0, 10),
      actiontime: new Date()
        .toTimeString()
        .slice(0, 8),
      comments:
        `Permanently deleted project: ${project.projecttitle}`,
    });

  return NextResponse.json({
    ok: true,
    projectid,
    message: "Project deleted successfully.",
  });
}
