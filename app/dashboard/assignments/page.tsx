import { ContactRound } from "lucide-react";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { canAccess } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import AssignmentsWorkspace from "./workspace";

export default async function AssignmentsPage() {
  const viewer = await getViewer();

  if (viewer.userType !== "Staff") {
    redirect("/dashboard/portal");
  }

  const admin = createAdminClient();

  const [
    projectsResult,
    staffResult,
    assignmentsResult,
    managerAssignmentsResult,
  ] = await Promise.all([
    admin
      .from("projects")
      .select(
        "projectid,projecttitle,projectmanageruserid",
      )
      .order("projectid"),

    admin
      .from("users")
      .select(
        "userid,fullname,department",
      )
      .eq("usertype", "Staff")
      .eq("status", "Active")
      .order("fullname"),

    admin
      .from("projectassignments")
      .select(
        "assignmentid,projectid,userid,assignmentrole,approvalstatus,active,assignedbyuserid,assignedat,authorizedat,authorizedbyuserid",
      )
      .order("assignedat", {
        ascending: false,
      }),

    admin
      .from("projectassignments")
      .select("projectid")
      .eq("userid", viewer.userId)
      .eq("assignmentrole", "Project Manager")
      .eq("approvalstatus", "Approved")
      .eq("active", true),
  ]);

  const projects = projectsResult.data ?? [];
  const staff = staffResult.data ?? [];
  const allAssignments =
    assignmentsResult.data ?? [];

  const managedProjectIds = new Set(
    (managerAssignmentsResult.data ?? []).map(
      (assignment) => assignment.projectid,
    ),
  );

  const isSuperUser =
    viewer.roleName === "Super User";

  const isMDOffice =
    viewer.department === "MD Office";

  const isExecutiveDirector =
    viewer.department === "Executive Director";

  const hasModuleAccess =
    canAccess(viewer, "assignments") ||
    managedProjectIds.size > 0;

  if (!hasModuleAccess) {
    redirect("/dashboard?error=forbidden");
  }

  /*
   * ONLY Project Managers create assignments.
   */
  const canCreate =
    managedProjectIds.size > 0;

  /*
   * MD Office reviews/approves assignments.
   * Super User remains the administrative override.
   */
  const canApprove =
    isSuperUser ||
    (
      isMDOffice &&
      ["Authorizer", "MD Office"].includes(
        viewer.roleName,
      )
    );

  const canViewAll =
    canApprove ||
    isExecutiveDirector;

  const visibleProjects =
    canCreate
      ? projects.filter(
          (project) =>
            managedProjectIds.has(
              project.projectid,
            ),
        )
      : projects;

  const viewerAssignedProjectIds =
    new Set(
      allAssignments
        .filter(
          (assignment) =>
            assignment.userid === viewer.userId &&
            assignment.approvalstatus === "Approved" &&
            assignment.active,
        )
        .map(
          (assignment) => assignment.projectid,
        ),
    );

  const visibleAssignments =
    canViewAll
      ? allAssignments
      : managedProjectIds.size > 0
        ? allAssignments.filter(
            (assignment) =>
              managedProjectIds.has(
                assignment.projectid,
              ),
          )
        : allAssignments.filter(
            (assignment) =>
              viewerAssignedProjectIds.has(
                assignment.projectid,
              ),
          );

  const projectNames = new Map(
    projects.map((project) => [
      project.projectid,
      project.projecttitle,
    ]),
  );

  const staffNames = new Map(
    staff.map((person) => [
      person.userid,
      person.fullname,
    ]),
  );

  const assignments =
    visibleAssignments.map(
      (assignment) => ({
        ...assignment,

        projects: {
          projecttitle:
            projectNames.get(
              assignment.projectid,
            ) ??
            "Project unavailable",
        },

        users: {
          fullname:
            staffNames.get(
              assignment.userid,
            ) ??
            "Staff member unavailable",
        },

        authorizerName:
          assignment.authorizedbyuserid
            ? staffNames.get(
                assignment.authorizedbyuserid,
              ) ??
              "MD Office"
            : null,
      }),
    );

  return (
    <div>
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white">
          <ContactRound size={20} />
        </div>

        <div>
          <h1 className="text-xl font-semibold">
            Project assignments
          </h1>

          <p className="text-sm text-slate-500">
            Project Managers assign project team members; MD Office reviews and approves or rejects every assignment.
          </p>
        </div>
      </header>

      <AssignmentsWorkspace
        projects={visibleProjects}
        staff={staff}
        assignments={assignments}
        canCreate={canCreate}
        canApprove={canApprove}
      />
    </div>
  );
}
