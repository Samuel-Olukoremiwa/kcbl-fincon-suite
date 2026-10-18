import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { canAccess } from "@/lib/access";

export async function GET() {
  const viewer = await getViewer();
  const admin = createAdminClient();

  let projectIds:
    | string[]
    | null = null;

  let managedProjectIds =
    new Set<string>();

  let operationsViewer = false;

  if (
    viewer.userType === "Client"
  ) {
    const {
      data: client,
    } = await admin
      .from("clients")
      .select("clientid")
      .eq(
        "linkeduserid",
        viewer.userId,
      )
      .maybeSingle();

    if (!client) {
      return NextResponse.json([]);
    }

    const {
      data: projects,
    } = await admin
      .from("projects")
      .select("projectid")
      .eq(
        "clientid",
        client.clientid,
      );

    projectIds = (
      projects ?? []
    ).map(
      (project) =>
        project.projectid,
    );
  } else if (
    viewer.userType === "Staff" &&
    viewer.department === "Operations"
  ) {
    operationsViewer = true;

    const {
      data: assignments,
      error: assignmentError,
    } = await admin
      .from("projectassignments")
      .select(
        "projectid,assignmentrole",
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

    if (assignmentError) {
      return NextResponse.json(
        {
          error:
            assignmentError.message,
        },
        { status: 500 },
      );
    }

    projectIds = Array.from(
      new Set(
        (
          assignments ?? []
        ).map(
          (assignment) =>
            assignment.projectid,
        ),
      ),
    );

    managedProjectIds =
      new Set(
        (
          assignments ?? []
        )
          .filter(
            (assignment) =>
              assignment.assignmentrole ===
              "Project Manager",
          )
          .map(
            (assignment) =>
              assignment.projectid,
          ),
      );
  } else if (
    !canAccess(
      viewer,
      "reports",
    ) &&
    viewer.roleName !==
      "Super User"
  ) {
    return NextResponse.json(
      {
        error:
          "Not permitted to view project reports.",
      },
      { status: 403 },
    );
  }

  if (
    projectIds &&
    projectIds.length === 0
  ) {
    return NextResponse.json([]);
  }

  let query = admin
    .from("projectreports")
    .select(
      `
        reportid,
        projectid,
        reportweek,
        reportdate,
        reporttype,
        filename,
        filesize,
        uploadedat,
        uploadedbyuserid,
        updatedat,
        clientnotifiedat,
        reviewstatus,
        progresspct,
        supervisorcomments,
        supervisorreviewedat,
        authorizedat,
        authorizationcomments,
        projects(
          projecttitle,
          clientid,
          status,
          clients(
            fullnameorcompanyname
          )
        ),
        users!projectreports_uploadedbyuserid_fkey(
          fullname
        ),
        reviewer:users!projectreports_supervisorreviewedbyuserid_fkey(
          fullname
        ),
        authorizer:users!projectreports_authorizedbyuserid_fkey(
          fullname
        ),
        projectreportpdfs(
          pdfid,
          filename,
          filesize,
          uploadedat
        ),
        projectreportmedia(
          mediaid,
          filename,
          filesize,
          mimetype,
          mediatype,
          uploadedat
        )
      `,
    )
    .order(
      "reportweek",
      { ascending: false },
    )
    .order(
      "updatedat",
      { ascending: false },
    )
    .order(
      "reportid",
      { ascending: false },
    );

  if (projectIds) {
    query = query.in(
      "projectid",
      projectIds,
    );
  }

  if (
    viewer.userType === "Client"
  ) {
    query = query
      .eq(
        "reporttype",
        "Project Manager",
      )
      .eq(
        "reviewstatus",
        "Authorized",
      );
  }

  const {
    data,
    error,
  } = await query;

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  let rows =
    data ?? [];

  if (operationsViewer) {
    rows = rows.filter(
      (report) =>
        managedProjectIds.has(
          report.projectid,
        ) ||
        report.uploadedbyuserid ===
          viewer.userId,
    );
  }

  return NextResponse.json(rows);
}
