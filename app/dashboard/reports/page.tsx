import { FileText } from "lucide-react";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import {
  canAccess,
  canManageProjectReports,
  canSubmitProgressReports,
} from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import ReportWorkspace from "./report-workspace-v2";

type ProjectWithRole = {
  projectid: string;
  projecttitle: string;
  status?: string;
  assignmentrole: string;
  clients?: {
    fullnameorcompanyname: string;
  } | null;
};

export default async function ReportsPage() {
  const viewer = await getViewer();

  if (
    !canAccess(
      viewer,
      "reports",
    ) &&
    viewer.roleName !==
      "Super User"
  ) {
    redirect(
      "/dashboard?error=forbidden",
    );
  }

  const canUpload =
    canSubmitProgressReports(
      viewer,
    );

  const canAuthorize =
    canManageProjectReports(
      viewer,
    ) ||
    viewer.roleName ===
      "Super User";

  const admin =
    createAdminClient();

  let projects:
    ProjectWithRole[] = [];

  if (canUpload) {
    const {
      data,
    } = await admin
      .from(
        "projectassignments",
      )
      .select(
        `
          assignmentrole,
          projects!inner(
            projectid,
            projecttitle,
            clientid,
            status,
            clients(
              fullnameorcompanyname
            )
          )
        `,
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

    const byProject =
      new Map<
        string,
        ProjectWithRole
      >();

    for (
      const row of
        data ?? []
    ) {
      const project =
        row.projects as unknown as {
          projectid: string;
          projecttitle: string;
          status?: string;
          clients?: {
            fullnameorcompanyname: string;
          } | null;
        } | null;

      if (!project) {
        continue;
      }

      const existing =
        byProject.get(
          project.projectid,
        );

      if (
        !existing ||
        row.assignmentrole ===
          "Project Manager"
      ) {
        byProject.set(
          project.projectid,
          {
            ...project,
            assignmentrole:
              row.assignmentrole,
          },
        );
      }
    }

    projects =
      Array.from(
        byProject.values(),
      ).sort(
        (a, b) =>
          a.projecttitle.localeCompare(
            b.projecttitle,
          ),
      );
  }

  const canReview =
    projects.some(
      (project) =>
        project.assignmentrole ===
        "Project Manager",
    );

  return (
    <div>
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white">
          <FileText
            size={20}
          />
        </div>

        <div>
          <h1 className="text-xl font-semibold">
            Project Reports
          </h1>

          <p className="text-sm text-slate-500">
            Operations reports are approved by the Project Manager. Project Manager Progress Reports are reviewed by MD Office before becoming client-facing.
          </p>
        </div>
      </header>

      <ReportWorkspace
        projects={
          projects
        }
        canUpload={
          canUpload
        }
        canReview={
          canReview
        }
        canAuthorize={
          canAuthorize
        }
      />
    </div>
  );
}
