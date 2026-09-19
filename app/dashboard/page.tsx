import Link from "next/link";
import { Users, FileCheck2, Banknote, Building2, Truck, HardHat, Landmark, WalletCards, ReceiptText, Clock3, ArrowRight } from "lucide-react";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { money, date } from "@/lib/client-utils";
import { canAccess } from "@/lib/access";

export default async function DashboardPage() {
  const viewer = await getViewer();
  if (viewer.userType === "Client") redirect("/dashboard/portal");
  if (!canAccess(viewer, "dashboard")) {
    if (canAccess(viewer, "reports")) redirect("/dashboard/reports");
    if (canAccess(viewer, "clients")) redirect("/dashboard/clients");
    if (canAccess(viewer, "transactions")) redirect("/dashboard/transactions");
    if (canAccess(viewer, "audit")) redirect("/dashboard/audit");
    redirect("/login?error=access");
  }
  const supabase = createClient();
  const [{ data: projects }, { data: clients }, { data: inflows }, { data: outflows }] = await Promise.all([
    supabase.from("projects").select("projectid, clientid, projecttitle, estimatedvalue, status, startdate, expectedenddate").order("projectid", { ascending: false }),
    supabase.from("clients").select("clientid, fullnameorcompanyname").order("clientid", { ascending: true }),
    supabase.from("cashinflowreceivables").select("transactionid, amount, approvalstatus, transactiondate").order("transactiondate", { ascending: false }),
    supabase.from("cashoutflowexpenditure").select("transactionid, amount, approvalstatus, transactiondate").order("transactiondate", { ascending: false }),
  ]);
  const isSuperUser = viewer.roleName === "Super User";
  const firstName = viewer.fullName.split(" ")[0];
  const activeProjects = (projects ?? []).filter(project => project.status !== "Completed");
  const totalBudget = activeProjects.reduce((sum, project) => sum + Number(project.estimatedvalue), 0);
  const approvedInflow = (inflows ?? []).filter(x => x.approvalstatus === "Approved").reduce((sum, x) => sum + Number(x.amount), 0);
  const approvedOutflow = (outflows ?? []).filter(x => x.approvalstatus === "Approved").reduce((sum, x) => sum + Number(x.amount), 0);
  const pending = [...(inflows ?? []), ...(outflows ?? [])].filter(x => x.approvalstatus === "Pending").length;
  const cashPosition = approvedInflow - approvedOutflow;
  const health = cashPosition < 0 ? "Critical" : pending > 0 || approvedOutflow > approvedInflow ? "Warning" : "Healthy";

  return (
    <div>
      <p className="text-sm font-medium uppercase tracking-wide text-amber-600">
        {viewer.roleName}
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-ink">
        {firstName ? `Welcome back, ${firstName}` : "Dashboard"}
      </h1>
      <p className="mt-1 text-sm text-slate-500">Live financial position across the projects you can access.</p>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="section-header section-title">Live financial tracker</p>
            <p className="mt-1 text-sm text-slate-500">Approved transactions feed these figures in real time.</p>
          </div>
          <span className={"badge " + (health === "Healthy" ? "badge-success" : health === "Warning" ? "badge-warning" : "badge-danger")}>
            Financial health: {health}
          </span>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={NairaIcon} label="Total active project value" value={money(totalBudget)} sub={<Link href="/dashboard/directory" className="font-medium text-navy hover:underline">{clients?.length ?? 0} client(s) · {activeProjects.length} active project(s)</Link>}/>
          <Metric icon={WalletCards} label="Approved cash inflow" value={money(approvedInflow)} sub="Posted client payments"/>
          <Metric icon={ReceiptText} label="Approved expenditure" value={money(approvedOutflow)} sub="Posted project spend"/>
          <Metric icon={Clock3} label="Current cash position" value={money(cashPosition)} sub={`${pending} pending approval(s)`} danger={cashPosition < 0}/>
        </div>
      </section>

      <section className="mt-8 grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 p-5">
            <div>
              <h2 className="font-semibold text-ink">Client project tracker</h2>
              <p className="mt-1 text-sm text-slate-500">Clients and the number of projects currently assigned to each.</p>
            </div>
            <Link href="/dashboard/projects" className="text-sm font-medium text-navy hover:underline">View projects</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {clients?.slice(0, 5).map(client => {
              const clientProjects = (projects ?? []).filter(project => project.clientid === client.clientid);
              return (
                <div key={client.clientid} className="row-interactive flex items-center justify-between gap-4 p-5">
                  <div>
                    <p className="font-medium text-ink">{client.fullnameorcompanyname}</p>
                    <p className="mt-1 text-xs text-slate-400">{client.clientid}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{clientProjects.length} project(s)</p>
                    <p className="mt-1 text-xs text-slate-400">{clientProjects.filter(p => p.status !== "Completed").length} active</p>
                  </div>
                </div>
              );
            })}
            {!clients?.length && <p className="p-10 text-center text-slate-400">Create a client and project to begin live tracking.</p>}
          </div>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold text-ink">Financial control status</h2>
          <p className="mt-1 text-sm text-slate-500">Approval workflow at a glance.</p>
          <div className="mt-5 space-y-4">
            <StatusRow label="Inflow awaiting approval" value={(inflows ?? []).filter(x => x.approvalstatus === "Pending").length}/>
            <StatusRow label="Outflow awaiting approval" value={(outflows ?? []).filter(x => x.approvalstatus === "Pending").length}/>
            <StatusRow label="Approved transactions" value={(inflows ?? []).filter(x => x.approvalstatus === "Approved").length + (outflows ?? []).filter(x => x.approvalstatus === "Approved").length}/>
          </div>
          <Link href="/dashboard/transactions" className="btn-primary mt-6 w-full">Open transaction workspace</Link>
        </div>
      </section>

      <section className="mt-9">
        <p className="section-header section-title">Workspace</p>
        <p className="mt-1 text-sm text-slate-500">Open a module to manage its records.</p>
        <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-5">
          <DashboardCard
            href="/dashboard/users"
            icon={Users}
            title="User Management"
            description="Create and manage Staff and Client accounts."
            enabled={isSuperUser}
          />
          <DashboardCard
            href="/dashboard/clients"
            icon={FileCheck2}
            title="Clients & KYC"
            description="Client onboarding and KYC records."
            enabled={true}
          />
          <DashboardCard
            href="/dashboard/transactions"
            icon={Banknote}
            title="Transactions"
            description="Cash inflow, outflow, and Maker-Checker approvals."
            enabled={true}
          />
          <DashboardCard
            href="/dashboard/projects"
            icon={Building2}
            title="Project Portfolio"
            description="Projects, values and assigned managers."
            enabled={true}
          />
          <DashboardCard href="/dashboard/partners" icon={Truck} title="Suppliers & Subcontractors" description="A single directory for external partners and payment details." enabled={true}/>
          <DashboardCard href="/dashboard/audit" icon={Landmark} title="Audit Trail" description="Maker-Checker activity history." enabled={true}/>
        </div>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value, sub, danger=false }: { icon: React.ElementType; label: string; value: string; sub: React.ReactNode; danger?: boolean }) {
  return (
    <div className={"card-metric" + (danger ? " card-metric--danger" : "")}>
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white">
        <Icon size={20}/>
      </div>
      <p className="mt-4 text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${danger ? "text-red-700" : "text-ink"}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-400">{sub}</p>
    </div>
  );
}
function NairaIcon({ size = 20 }: { size?: number }) { return <span aria-label="Naira" className="font-semibold leading-none" style={{ fontSize: size }}>₦</span>; }
function StatusRow({ label, value }: { label: string; value: number }) { return <div className="flex items-center justify-between border-b border-slate-100 pb-3 text-sm last:border-0"><span className="text-slate-600">{label}</span><span className="badge-neutral">{value}</span></div>; }

function DashboardCard({
  href,
  icon: Icon,
  title,
  description,
  enabled,
}: {
  href: string;
  icon: React.ElementType;
  title: string;
  description: string;
  enabled: boolean;
}) {
  const content = (
    <>
      <div
        className={
          "flex h-10 w-10 items-center justify-center rounded-md " +
          (enabled ? "bg-navy text-white" : "bg-slate-100 text-slate-400")
        }
      >
        <Icon size={20} strokeWidth={1.75} />
      </div>
      <p className={"mt-4 text-sm font-semibold " + (enabled ? "text-ink" : "text-slate-400")}>
        {title}
      </p>
      <p className="mt-1 text-sm text-slate-500">
        {enabled ? description : "Coming soon."}
      </p>
      {enabled && (
        <p className="mt-4 flex items-center gap-1 text-sm font-medium text-navy">
          Open <ArrowRight size={14} strokeWidth={2} />
        </p>
      )}
    </>
  );

  if (!enabled) {
    return <div className="card cursor-not-allowed p-5 opacity-70">{content}</div>;
  }

  return (
    <Link href={href} className="card group p-5 transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-md">
      {content}
    </Link>
  );
}