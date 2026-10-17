import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: {
      assignmentid: string;
    };
  },
) {
  const viewer = await getViewer();

  const canAuthorize =
    viewer.roleName === "Super User" ||
    (
      viewer.department === "MD Office" &&
      ["Authorizer", "MD Office"].includes(
        viewer.roleName,
      )
    );

  if (!canAuthorize) {
    return NextResponse.json(
      {
        error:
          "Only MD Office may review and approve project assignments.",
      },
      { status: 403 },
    );
  }

  const { decision } = await request.json();

  if (
    !["Approved", "Rejected"].includes(
      decision,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Choose Approved or Rejected.",
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const {
    data: assignment,
    error: assignmentError,
  } = await admin
    .from("projectassignments")
    .select(
      "assignmentid,projectid,userid,assignmentrole,approvalstatus",
    )
    .eq(
      "assignmentid",
      params.assignmentid,
    )
    .maybeSingle();

  if (assignmentError || !assignment) {
    return NextResponse.json(
      {
        error:
          assignmentError?.message ??
          "Assignment not found.",
      },
      { status: 404 },
    );
  }

  if (assignment.approvalstatus !== "Pending") {
    return NextResponse.json(
      {
        error:
          "This assignment is no longer pending.",
      },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();

  const { error } =
    await admin
      .from("projectassignments")
      .update({
        approvalstatus: decision,
        authorizedbyuserid:
          viewer.userId,
        authorizedat: now,
        active:
          decision === "Approved",
      })
      .eq(
        "assignmentid",
        params.assignmentid,
      )
      .eq(
        "approvalstatus",
        "Pending",
      );

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 },
    );
  }

  /*
   * If MD Office decides the Project Manager assignment,
   * keep projects.projectmanageruserid aligned with the
   * approved assignment.
   */
  if (
    assignment.assignmentrole ===
    "Project Manager"
  ) {
    if (
      decision === "Approved"
    ) {
      const {
        error: projectUpdateError,
      } = await admin
        .from("projects")
        .update({
          projectmanageruserid:
            assignment.userid,
        })
        .eq(
          "projectid",
          assignment.projectid,
        );

      if (projectUpdateError) {
        return NextResponse.json(
          {
            error:
              `Assignment approved, but the project manager field could not be synchronized: ${projectUpdateError.message}`,
          },
          { status: 500 },
        );
      }
    } else {
      const {
        data: project,
      } = await admin
        .from("projects")
        .select("projectmanageruserid")
        .eq(
          "projectid",
          assignment.projectid,
        )
        .maybeSingle();

      if (
        project?.projectmanageruserid ===
        assignment.userid
      ) {
        await admin
          .from("projects")
          .update({
            projectmanageruserid: null,
          })
          .eq(
            "projectid",
            assignment.projectid,
          );
      }
    }
  }

  return NextResponse.json({
    ok: true,
  });
}
