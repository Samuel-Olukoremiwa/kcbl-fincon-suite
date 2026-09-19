import { Banknote } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePageAccess } from "@/lib/viewer";
import TransactionsClient from "./transactions-client";
import PageHeader from "../page-header";

export default async function TransactionsPage() {
  const viewer = await requirePageAccess("transactions");
  const s = createClient();
  const [
    { data: clients },
    { data: projects },
    { data: suppliers },
    { data: subcontractors },
    { data: inflows },
    { data: outflows },
  ] = await Promise.all([
    s.from("clients").select("clientid,fullnameorcompanyname"),
    s.from("projects").select("projectid,projecttitle"),
    s.from("suppliers").select("supplierid,suppliername").eq("status", "Active"),
    s.from("subcontractors").select("subcontractorid,subcontractorname").eq("status", "Active"),
    s
      .from("cashinflowreceivables")
      .select("transactionid,clientid,projectid,amount,transactiondate,paymentmethod,description,makeruserid,approvalstatus,checkeruserid,rejectionreason")
      .order("transactiondate", { ascending: false }),
    s
      .from("cashoutflowexpenditure")
      .select("transactionid,projectid,supplierid,subcontractorid,expenditurecategory,amount,transactiondate,paymentmethod,description,makeruserid,approvalstatus,checkeruserid,rejectionreason")
      .order("transactiondate", { ascending: false }),
  ]);

  const projectNames = new Map((projects ?? []).map((x) => [x.projectid, x.projecttitle]));
  const supplierNames = new Map((suppliers ?? []).map((x) => [x.supplierid, x.suppliername]));
  const subcontractorNames = new Map((subcontractors ?? []).map((x) => [x.subcontractorid, x.subcontractorname]));

  const detailedInflows = (inflows ?? []).map((x) => ({
    ...x,
    projectname: x.projectid ? (projectNames.get(x.projectid) ?? x.projectid) : "No project",
  }));

  const detailedOutflows = (outflows ?? []).map((x) => ({
    ...x,
    projectname: projectNames.get(x.projectid) ?? x.projectid,
    payeetype: x.supplierid ? "Supplier" : x.subcontractorid ? "Subcontractor" : "In-House",
    payeename: x.supplierid
      ? (supplierNames.get(x.supplierid) ?? x.supplierid)
      : x.subcontractorid
        ? (subcontractorNames.get(x.subcontractorid) ?? x.subcontractorid)
        : "In-House",
  }));

  return (
    <div>
      <PageHeader
        icon={Banknote}
        title="Transactions"
        description="Cash inflow, expense requests and Maker-Checker approvals."
      />

      <TransactionsClient
        viewer={viewer}
        clients={clients ?? []}
        projects={projects ?? []}
        suppliers={suppliers ?? []}
        subcontractors={subcontractors ?? []}
        inflows={detailedInflows}
        outflows={detailedOutflows}
      />
    </div>
  );
}