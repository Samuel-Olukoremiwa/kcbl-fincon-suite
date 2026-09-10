import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/viewer";

export async function GET(request: Request, { params }: { params: { archiveid: string } }) {
  const viewer = await requireStaff();
  const isSuperUser = viewer.roleName === "Super User";
  const isInternalControl = viewer.department === "Audit/Internal Control";
  if (!isSuperUser && !isInternalControl) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const archiveid = Number(params.archiveid);
  const supabase = createClient();

  const [clients, projects, suppliers, subcontractors, inflows, outflows] = await Promise.all([
    supabase.from("clients").select("clientid, fullnameorcompanyname, clienttype").eq("archiveid", archiveid),
    supabase.from("projects").select("projectid, projecttitle, estimatedvalue, status").eq("archiveid", archiveid),
    supabase.from("suppliers").select("supplierid, suppliername, supplycategory").eq("archiveid", archiveid),
    supabase.from("subcontractors").select("subcontractorid, subcontractorname, tradespecialty").eq("archiveid", archiveid),
    supabase.from("cashinflowreceivables").select("transactionid, amount, transactiondate, approvalstatus").eq("archiveid", archiveid),
    supabase.from("cashoutflowexpenditure").select("transactionid, amount, transactiondate, approvalstatus").eq("archiveid", archiveid),
  ]);

  return NextResponse.json({
    clients: clients.data ?? [],
    projects: projects.data ?? [],
    suppliers: suppliers.data ?? [],
    subcontractors: subcontractors.data ?? [],
    inflows: inflows.data ?? [],
    outflows: outflows.data ?? [],
  });
}