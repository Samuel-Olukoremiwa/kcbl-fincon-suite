import { FileText } from "lucide-react";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import {
  canAccess,
  canManageProjectReports,
  canSubmitProgressReports,
} from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import ReportWorkspace from "./report-workspace";

export default async function ReportsPage() {
  const viewer = await getViewer();

  const canUpload =
    canSubmitProgressReports(viewer);

  const canReview =
    viewer.department === "Operations";

  const canAuthorize =
    canManageProjectReports(viewer) ||
    viewer.roleName === "Super User";

  if (
    !canAccess(viewer, "reports") ||
    (viewer.userType !== "Client" &&
      !canUpload &&
      !canAuthorize &&
      viewer.roleName !== "Super User")
  ) {
    redirect("/dashboard?error=forbidden");
  }

  const admin = createAdminClient();

  let projects: any[] = [];

  if (canSubmitProgressReports(viewer)) {
    const { data } = await admin
      .from("projectassignments")
      .select(
        `
        projects!inner(
          projectid,
          projecttitle,
          clientid,
          status,
          clients(fullnameorcompanyname)
        )
      `,
      )
      .eq("userid", viewer.userId)
      .eq("approvalstatus", "Approved")
      .eq("active", true);

    projects = (data ?? [])
      .map((assignment: any) => assignment.projects)
      .filter(Boolean);
  }

  return (
    <div>
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white">
          <FileText size={20} />
        </div>

        <div>
          <h1 className="text-xl font-semibold">
            Progress Reports
          </h1>

          <p className="text-sm text-slate-500">
            Submit, review, authorize, view, and download project progress
            reports.
          </p>
        </div>
      </header>

      <ReportWorkspace
        projects={projects}
        canUpload={canUpload}
        canReview={canReview}
        canAuthorize={canAuthorize}
      />
    </div>
  );
}