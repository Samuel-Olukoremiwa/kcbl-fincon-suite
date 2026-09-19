import { ContactRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePageAccess } from "@/lib/viewer";
import { canViewFinancialRecords } from "@/lib/access";
import DirectoryWorkspace from "./directory-workspace";

export const dynamic = "force-dynamic";

export default async function DirectoryPage() {
  const viewer = await requirePageAccess("projects");
  const s = createClient();
  const canViewFinancial = canViewFinancialRecords(viewer);
  const [{ data: clients }, { data: projects }, { data: managers }] =
    await Promise.all([
      s
        .from("clients")
        .select(
          "clientid,fullnameorcompanyname,clienttype,email,phonenumber,address,preferredpaymentmethod",
        )
        .order("clientid"),
      s
        .from("projects")
        .select(
          canViewFinancial
            ? "projectid,clientid,projecttitle,projectlocation,projecttype,estimatedvalue,startdate,expectedenddate,status,projectmanageruserid"
            : "projectid,clientid,projecttitle,projectlocation,projecttype,startdate,expectedenddate,status,projectmanageruserid",
        )
        .order("projectid"),
      s.from("users").select("userid,fullname").eq("usertype", "Staff"),
    ]);
  const [{ data: inflows }, { data: outflows }] = canViewFinancial
    ? await Promise.all([
        s
          .from("cashinflowreceivables")
          .select("projectid,amount,approvalstatus"),
        s
          .from("cashoutflowexpenditure")
          .select("projectid,amount,approvalstatus"),
      ])
    : [{ data: [] }, { data: [] }];
  const sums = (rows: any[]) =>
    rows.reduce<Record<string, number>>((all, row) => {
      if (row.projectid && row.approvalstatus === "Approved")
        all[row.projectid] = (all[row.projectid] ?? 0) + Number(row.amount);
      return all;
    }, {});

  // Same latest-authorized-week logic as Projects — a client with several
  // projects gets a progress figure per project, never averaged.
  const { data: authorizedReports } = await s
    .from("projectreports")
    .select("projectid,reportweek,progresspct")
    .eq("reviewstatus", "Authorized")
    .not("progresspct", "is", null)
    .order("reportweek", { ascending: false });

  const progressByProject: Record<string, { pct: number; week: string }> = {};
  (authorizedReports ?? []).forEach((report) => {
    if (!progressByProject[report.projectid]) {
      progressByProject[report.projectid] = {
        pct: Number(report.progresspct),
        week: report.reportweek,
      };
    }
  });

  return (
    <div>
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white">
          <ContactRound size={20} />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Clients & project directory</h1>
          <p className="text-sm text-slate-500">
            Client records with project information and access-controlled
            financial data.
          </p>
        </div>
      </header>
      <DirectoryWorkspace
        clients={clients ?? []}
        projects={projects ?? []}
        managerNames={Object.fromEntries(
          (managers ?? []).map((x) => [x.userid, x.fullname]),
        )}
        inflows={sums(inflows ?? [])}
        outflows={sums(outflows ?? [])}
        progress={progressByProject}
        canViewFinancial={canViewFinancial}
      />
    </div>
  );
}