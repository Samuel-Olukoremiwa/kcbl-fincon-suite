import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLES = [
  "Project Manager",
  "Senior Supervisor",
  "Junior Supervisor",
  "QS",
  "Site Engineer",
  "Operations Staff",
];

function normalizeIds(value: unknown) {
  const raw = Array.isArray(value)
    ? value
    : value
      ? [value]
      : [];

  return Array.from(
    new Set(
      raw
        .map((item) =>
          String(item).trim(),
        )
        .filter(Boolean),
    ),
  );
}

export async function POST(
  request: Request,
) {
  const viewer = await getViewer();

  if (viewer.department !== "Operations") {
    return NextResponse.json(
      {
        error:
          "Only Operations may initiate a project assignment.",
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

  const projectids = normalizeIds(
    body.projectids ?? body.projectid,
  );

  const userid = String(
    body.userid ?? "",
  ).trim();

  const assignmentrole = String(
    body.assignmentrole ?? "",
  ).trim();

  if (
    !projectids.length ||
    !userid ||
    !ROLES.includes(assignmentrole)
  ) {
    return NextResponse.json(
      {
        error:
          "Select at least one project, a staff member, and a valid assignment role.",
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const {
    data: staffMember,
    error: staffError,
  } = await admin
    .from("users")
    .select(
      "userid,usertype,status,fullname",
    )
    .eq("userid", userid)
    .maybeSingle();

  if (staffError || !staffMember) {
    return NextResponse.json(
      {
        error:
          "The selected staff member could not be found.",
      },
      { status: 404 },
    );
  }

  if (
    staffMember.usertype !== "Staff" ||
    staffMember.status !== "Active"
  ) {
    return NextResponse.json(
      {
        error:
          "Project assignments can only be created for active staff users.",
      },
      { status: 400 },
    );
  }

  const {
    data: projects,
    error: projectError,
  } = await admin
    .from("projects")
    .select("projectid")
    .in("projectid", projectids);

  if (projectError) {
    return NextResponse.json(
      { error: projectError.message },
      { status: 400 },
    );
  }

  const foundProjectIds = new Set(
    (projects ?? []).map(
      (project) => project.projectid,
    ),
  );

  const missingProjectIds =
    projectids.filter(
      (projectid) =>
        !foundProjectIds.has(projectid),
    );

  if (missingProjectIds.length) {
    return NextResponse.json(
      {
        error:
          `These project codes could not be found: ${missingProjectIds.join(
            ", ",
          )}.`,
      },
      { status: 404 },
    );
  }

  const {
    data: existingAssignments,
    error: lookupError,
  } = await admin
    .from("projectassignments")
    .select(
      "projectid,assignmentid,approvalstatus",
    )
    .eq("userid", userid)
    .eq("assignmentrole", assignmentrole)
    .in("projectid", projectids);

  if (lookupError) {
    return NextResponse.json(
      { error: lookupError.message },
      { status: 400 },
    );
  }

  const existingProjectIds = new Set(
    (existingAssignments ?? []).map(
      (assignment) => assignment.projectid,
    ),
  );

  const newProjectIds = projectids.filter(
    (projectid) =>
      !existingProjectIds.has(projectid),
  );

  if (!newProjectIds.length) {
    return NextResponse.json({
      ok: true,
      existing: true,
      createdCount: 0,
      existingCount: projectids.length,
      message:
        "All selected project assignments already exist for this staff member and role.",
    });
  }

  const { error: insertError } = await admin
    .from("projectassignments")
    .insert(
      newProjectIds.map((projectid) => ({
        projectid,
        userid,
        assignmentrole,
        assignedbyuserid: viewer.userId,
        approvalstatus: "Pending",
        active: false,
      })),
    );

  if (insertError) {
    return NextResponse.json(
      {
        error:
          insertError.code === "23505"
            ? "One or more of these assignments were created by another request. Refresh and try again."
            : insertError.message,
      },
      {
        status:
          insertError.code === "23505"
            ? 409
            : 400,
      },
    );
  }

  const existingCount =
    projectids.length -
    newProjectIds.length;

  return NextResponse.json(
    {
      ok: true,
      createdCount:
        newProjectIds.length,
      existingCount,
      message:
        `${newProjectIds.length} project assignment${
          newProjectIds.length === 1
            ? ""
            : "s"
        } submitted for MD Office authorization.${
          existingCount
            ? ` ${existingCount} selected assignment${
                existingCount === 1
                  ? " already existed."
                  : "s already existed."
              }`
            : ""
        }`,
    },
    { status: 201 },
  );
}
