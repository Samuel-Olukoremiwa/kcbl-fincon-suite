import { ContactRound } from "lucide-react";
import { requirePageAccess } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import AssignmentsWorkspace from "./workspace";

export default async function AssignmentsPage() {
  const viewer = await requirePageAccess("assignments");
  const admin = createAdminClient();
  const canInitiate = viewer.department === "Operations";
  // MD Office is the assignment authorizer in the approved access matrix.
  const canAuthorize = viewer.department === "MD Office";
  const canViewAll = canAuthorize || viewer.roleName === "Super User";

  // Avoid embedded joins here: projectassignments has three foreign keys to
  // users, making users(fullname) ambiguous and causing an empty register.
  const [projectsResult, staffResult, assignmentsResult] = await Promise.all([
    admin.from("projects").select("projectid,projecttitle").order("projectid"),
    admin
      .from("users")
      .select("userid,fullname,department")
      .eq("usertype", "Staff")
      .eq("status", "Active")
      .order("fullname"),
    (canViewAll
      ? admin
          .from("projectassignments")
          .select(
            "assignmentid,projectid,userid,assignmentrole,approvalstatus,assignedat,authorizedat,authorizedbyuserid",
          )
      : admin
          .from("projectassignments")
          .select(
            "assignmentid,projectid,userid,assignmentrole,approvalstatus,assignedat,authorizedat,authorizedbyuserid",
          )
          .eq("assignedbyuserid", viewer.userId)
    ).order("assignedat", { ascending: false }),
  ]);
  const projects = projectsResult.data ?? [];
  const staff = staffResult.data ?? [];
  const projectNames = new Map(
    projects.map((project) => [project.projectid, project.projecttitle]),
  );
  const staffNames = new Map(
    staff.map((person) => [person.userid, person.fullname]),
  );
  const assignments = (assignmentsResult.data ?? []).map((assignment) => ({
    ...assignment,
    projects: {
      projecttitle:
        projectNames.get(assignment.projectid) ?? "Project unavailable",
    },
    users: {
      fullname: staffNames.get(assignment.userid) ?? "Staff member unavailable",
    },
    authorizerName: assignment.authorizedbyuserid
      ? (staffNames.get(assignment.authorizedbyuserid) ?? "MD Office")
      : null,
  }));

  return (
    <div>
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white">
          <ContactRound size={20} />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Project assignments</h1>
          <p className="text-sm text-slate-500">
            Operations initiates by project code; MD Office authorizes access.
          </p>
        </div>
      </header>
      <AssignmentsWorkspace
        projects={projects}
        staff={staff}
        assignments={assignments}
        canCreate={canInitiate}
        canApprove={canAuthorize}
      />
    </div>
  );
}
