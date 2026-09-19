import { Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePageAccess } from "@/lib/viewer";
import {
  canCreateClientOrProject,
  canViewFinancialRecords,
} from "@/lib/access";
import ProjectWorkspace from "./project-workspace";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const viewer = await requirePageAccess("projects");
  const supabase = createClient();

  const canViewFinancial = canViewFinancialRecords(viewer);

  const [{ data: projects }, { data: clients }, { data: managers }] =
    await Promise.all([
      supabase
        .from("projects")
        .select(
          canViewFinancial
            ? "projectid,clientid,projecttitle,projectlocation,estimatedvalue,startdate,expectedenddate,status"
            : "projectid,clientid,projecttitle,projectlocation,startdate,expectedenddate,status",
        )
        .order("clientid")
        .order("projectid"),

      supabase
        .from("clients")
        .select("clientid,fullnameorcompanyname")
        .order("fullnameorcompanyname"),

      supabase
        .from("users")
        .select("userid,fullname")
        .eq("usertype", "Staff")
        .order("fullname"),
    ]);

  const [{ data: inflows }, { data: outflows }] = canViewFinancial
    ? await Promise.all([
        supabase
          .from("cashinflowreceivables")
          .select("projectid,amount,approvalstatus"),

        supabase
          .from("cashoutflowexpenditure")
          .select("projectid,amount,approvalstatus"),
      ])
    : [{ data: [] }, { data: [] }];

  /*
   * Only AUTHORIZED reports are allowed to affect project progress.
   *
   * Reports are sorted newest-first, so the first authorized report
   * encountered for each project is the latest authorized progress.
   */
  const {
    data: authorizedReports,
    error: authorizedReportsError,
  } = await supabase
    .from("projectreports")
    .select("projectid,reportweek,progresspct")
    .eq("reviewstatus", "Authorized")
    .not("progresspct", "is", null)
    .order("reportweek", { ascending: false });

  if (authorizedReportsError) {
    console.error(
      "Failed to load authorized project reports:",
      authorizedReportsError,
    );
  }

  const progressByProject = new Map<
    string,
    {
      pct: number;
      week: string;
    }
  >();

  (authorizedReports ?? []).forEach((report) => {
    if (!progressByProject.has(report.projectid)) {
      progressByProject.set(report.projectid, {
        pct: Number(report.progresspct),
        week: report.reportweek,
      });
    }
  });

  const totals = (
    rows: {
      projectid: string | null;
      amount: number | string;
      approvalstatus: string;
    }[],
  ) =>
    rows.reduce<Record<string, number>>((all, row) => {
      if (row.projectid && row.approvalstatus === "Approved") {
        all[row.projectid] =
          (all[row.projectid] ?? 0) + Number(row.amount);
      }

      return all;
    }, {});

  const inflow = totals(inflows ?? []);
  const outflow = totals(outflows ?? []);

  const clientNames = new Map(
    (clients ?? []).map((client) => [
      client.clientid,
      client.fullnameorcompanyname,
    ]),
  );

  const projectRows = (projects ?? []).map((project: any) => ({
    ...project,

    clientName:
      clientNames.get(project.clientid) ?? "Unassigned",

    inflow:
      inflow[project.projectid] ?? 0,

    outflow:
      outflow[project.projectid] ?? 0,

    progress:
      progressByProject.get(project.projectid) ?? null,
  }));

  return (
    <div>
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white">
          <Building2 size={20} />
        </div>

        <div>
          <h1 className="text-xl font-semibold">
            Projects
          </h1>

          <p className="text-sm text-slate-500">
            Business Development creates drafts; MD Office authorizes activation
            and status changes.
          </p>
        </div>
      </header>

      <ProjectWorkspace
        projects={projectRows}
        clients={clients ?? []}
        managers={managers ?? []}
        canEdit={
          viewer.department === "MD Office" ||
          viewer.roleName === "Super User"
        }
        canCreate={canCreateClientOrProject(viewer)}
        canViewFinancial={canViewFinancial}
      />
    </div>
  );
}