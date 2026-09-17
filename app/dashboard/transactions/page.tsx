import { Banknote } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePageAccess } from "@/lib/viewer";
import TransactionsClient from "./transactions-client";

export default async function TransactionsPage() {
  const viewer = await requirePageAccess("transactions"); const s = createClient();
  const [{ data: clients }, { data: projects }, { data: suppliers }, { data: subcontractors }, { data: inflows }, { data: outflows }] = await Promise.all([
    s.from("clients").select("clientid,fullnameorcompanyname"), s.from("projects").select("projectid,projecttitle"), s.from("suppliers").select("supplierid,suppliername").eq("status", "Active"), s.from("subcontractors").select("subcontractorid,subcontractorname").eq("status", "Active"),
    s.from("cashinflowreceivables").select("transactionid,clientid,projectid,amount,transactiondate,paymentmethod,description,makeruserid,approvalstatus,checkeruserid,rejectionreason").order("transactiondate", { ascending: false }),
    s.from("cashoutflowexpenditure").select("transactionid,projectid,supplierid,subcontractorid,expenditurecategory,amount,transactiondate,paymentmethod,description,makeruserid,approvalstatus,checkeruserid,rejectionreason").order("transactiondate", { ascending: false }),
  ]);
  const projectNames = new Map((projects ?? []).map(x => [x.projectid, x.projecttitle])); const supplierNames = new Map((suppliers ?? []).map(x => [x.supplierid, x.suppliername])); const subcontractorNames = new Map((subcontractors ?? []).map(x => [x.subcontractorid, x.subcontractorname]));
  const detailedInflows = (inflows ?? []).map(x => ({ ...x, projectname: x.projectid ? projectNames.get(x.projectid) ?? x.projectid : "No project" }));
  const detailedOutflows = (outflows ?? []).map(x => ({ ...x, projectname: projectNames.get(x.projectid) ?? x.projectid, payeename: x.supplierid ? supplierNames.get(x.supplierid) ?? x.supplierid : x.subcontractorid ? subcontractorNames.get(x.subcontractorid) ?? x.subcontractorid : "In-House" }));
  return <div><header className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white"><Banknote size={20}/></div><div><h1 className="text-xl font-semibold">Transactions</h1><p className="text-sm text-slate-500">Cash inflow, expense requests and Maker-Checker approvals.</p></div></header><TransactionsClient viewer={viewer} clients={clients ?? []} projects={projects ?? []} suppliers={suppliers ?? []} subcontractors={subcontractors ?? []} inflows={detailedInflows} outflows={detailedOutflows}/></div>;
}
