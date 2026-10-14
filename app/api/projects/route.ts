import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
      {
        error: "Not authorized to create projects.",
      },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid request body.",
      },
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
      {
        error: "Select a client.",
      },
      { status: 400 },
    );
  }

  if (!title) {
    return NextResponse.json(
      {
        error: "Project title is required.",
      },
      { status: 400 },
    );
  }

  if (!location) {
    return NextResponse.json(
      {
        error: "Project location is required.",
      },
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
      {
        error: "Select a valid project type.",
      },
      { status: 400 },
    );
  }

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return NextResponse.json(
      {
        error:
          "Estimated project value must be greater than zero.",
      },
      { status: 400 },
    );
  }

  if (
    start &&
    end &&
    end < start
  ) {
    return NextResponse.json(
      {
        error:
          "Expected end date cannot be earlier than the start date.",
      },
      { status: 400 },
    );
  }

  const supabase = createClient();

  /*
   * ----------------------------------------------------------
   * VERIFY CLIENT
   * ----------------------------------------------------------
   */
  const {
    data: client,
    error: clientError,
  } = await supabase
    .from("clients")
    .select("clientid")
    .eq("clientid", clientid)
    .maybeSingle();

  if (clientError) {
    return NextResponse.json(
      {
        error:
          "Could not verify the selected client.",
      },
      { status: 400 },
    );
  }

  if (!client) {
    return NextResponse.json(
      {
        error: "Client not found.",
      },
      { status: 404 },
    );
  }

  /*
   * ----------------------------------------------------------
   * DUPLICATE PROJECT SAFEGUARD
   *
   * A client cannot have two projects with the same
   * project title and project location.
   * ----------------------------------------------------------
   */
  const {
    data: existingClientProjects,
    error: duplicateCheckError,
  } = await supabase
    .from("projects")
    .select(
      "projectid,projecttitle,projectlocation",
    )
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

  const normalizedTitle =
    title.toLowerCase();

  const normalizedLocation =
    location.toLowerCase();

  const duplicateProject =
    (existingClientProjects ?? []).find(
      (project) =>
        normalizeText(
          project.projecttitle,
        ).toLowerCase() ===
          normalizedTitle &&
        normalizeText(
          project.projectlocation,
        ).toLowerCase() ===
          normalizedLocation,
    );

  if (duplicateProject) {
    return NextResponse.json(
      {
        error:
          `This project already exists as ${duplicateProject.projectid}. ` +
          "A client cannot have more than one project with the same title and location.",
        projectid:
          duplicateProject.projectid,
      },
      { status: 409 },
    );
  }

  /*
   * ----------------------------------------------------------
   * VERIFY PROJECT MANAGER
   * ----------------------------------------------------------
   */
  if (manager) {
    const {
      data: managerUser,
      error: managerError,
    } = await supabase
      .from("users")
      .select(
        "userid,usertype,status",
      )
      .eq("userid", manager)
      .maybeSingle();

    if (
      managerError ||
      !managerUser
    ) {
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
  }

  /*
   * ----------------------------------------------------------
   * GENERATE PROJECT ID
   *
   * PRJ001
   * PRJ002
   * PRJ003
   * ...
   * ----------------------------------------------------------
   */
  const {
    data: existingProjects,
    error: existingError,
  } = await supabase
    .from("projects")
    .select("projectid");

  if (existingError) {
    return NextResponse.json(
      {
        error:
          "Could not generate the project code.",
      },
      { status: 400 },
    );
  }

  const projectid = nextPrefixedId(
    (existingProjects ?? []).map(
      (project) =>
        project.projectid,
    ),
    "PRJ",
    3,
  );

  /*
   * ----------------------------------------------------------
   * CREATE PROJECT
   * ----------------------------------------------------------
   */
  const {
    error: insertError,
  } = await supabase
    .from("projects")
    .insert({
      projectid,
      clientid,
      projecttitle: title,
      projectlocation: location,
      projecttype: type,
      estimatedvalue: value,
      startdate:
        start || null,
      expectedenddate:
        end || null,
      status: "Pending",
      projectmanageruserid:
        manager || null,
      datecreated:
        new Date()
          .toISOString()
          .slice(0, 10),
    });

  if (insertError) {
    /*
     * Database unique constraint.
     */
    if (
      insertError.code === "23505"
    ) {
      const duplicateConstraint =
        insertError.message
          ?.toLowerCase()
          .includes(
            "ux_projects_client_title_location",
          );

      if (duplicateConstraint) {
        return NextResponse.json(
          {
            error:
              "This project already exists for this client. Duplicate project creation was blocked.",
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        {
          error:
            "Another project was created at the same time. Please refresh the page and try again.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        error: insertError.message,
      },
      { status: 400 },
    );
  }

  /*
   * ----------------------------------------------------------
   * AUDIT LOG
   * ----------------------------------------------------------
   */
  const {
    error: auditError,
  } = await supabase
    .from("makercheckerauditlog")
    .insert({
      logid: `LOG${Date.now()
        .toString()
        .slice(-9)}`,

      transactiontype:
        "Project",

      transactionid:
        projectid,

      actiontype:
        "Created",

      actionbyuserid:
        viewer.userId,

      actiondate:
        new Date()
          .toISOString()
          .slice(0, 10),

      actiontime:
        new Date()
          .toTimeString()
          .slice(0, 8),

      comments:
        title,
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
      message:
        "Project created successfully.",
    },
    { status: 201 },
  );
}

export async function PATCH(request: Request) {
  const {
    viewer,
    forbidden,
  } =
    await requireApiWriteAccess(
      "projects",
    );

  const canAuthorizeStatus =
    viewer?.roleName ===
      "Super User" ||
    (
      viewer?.department ===
        "MD Office" &&
      [
        "Authorizer",
        "MD Office",
      ].includes(
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

  let body:
    Record<string, unknown>;

  try {
    body =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid request body.",
      },
      { status: 400 },
    );
  }

  const projectid =
    normalizeText(
      body.projectid,
    );

  const status =
    normalizeText(
      body.status,
    );

  const allowedStatuses = [
    "Ongoing",
    "Completed",
    "On Hold",
    "Pending",
  ];

  if (
    !projectid ||
    !allowedStatuses.includes(
      status,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Choose a valid project status.",
      },
      { status: 400 },
    );
  }

  const supabase =
    createClient();

  /*
   * ----------------------------------------------------------
   * GET CURRENT PROJECT STATUS
   * ----------------------------------------------------------
   */
  const {
    data: project,
    error: projectError,
  } = await supabase
    .from("projects")
    .select(
      "projectid,status",
    )
    .eq(
      "projectid",
      projectid,
    )
    .maybeSingle();

  if (
    projectError ||
    !project
  ) {
    return NextResponse.json(
      {
        error:
          "Project not found.",
      },
      { status: 404 },
    );
  }

  if (
    project.status ===
    status
  ) {
    return NextResponse.json({
      ok: true,
    });
  }

  /*
   * ----------------------------------------------------------
   * UPDATE STATUS
   * ----------------------------------------------------------
   */
  const {
    error: updateError,
  } = await supabase
    .from("projects")
    .update({
      status,
    })
    .eq(
      "projectid",
      projectid,
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

  /*
   * ----------------------------------------------------------
   * AUDIT STATUS CHANGE
   * ----------------------------------------------------------
   */
  const {
    error: auditError,
  } = await supabase
    .from(
      "makercheckerauditlog",
    )
    .insert({
      logid: `LOG${Date.now()
        .toString()
        .slice(-9)}`,

      transactiontype:
        "Project",

      transactionid:
        projectid,

      actiontype:
        "Status Updated",

      actionbyuserid:
        viewer.userId,

      actiondate:
        new Date()
          .toISOString()
          .slice(0, 10),

      actiontime:
        new Date()
          .toTimeString()
          .slice(0, 8),

      comments:
        `Status changed from ${project.status} to ${status}`,
    });

  if (auditError) {
    console.error(
      "Project status audit log failed:",
      auditError,
    );
  }

  return NextResponse.json({
    ok: true,
  });
}