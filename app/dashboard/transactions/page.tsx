import { Banknote } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePageAccess } from "@/lib/viewer";
import TransactionsClient from "./transactions-client";
import PageHeader from "../page-header";

export default async function TransactionsPage() {
  const viewer = await requirePageAccess("transactions");

  const supabase = createClient();

  const [
    { data: clients },
    { data: projects },
    { data: suppliers },
    { data: subcontractors },
    { data: inflows },
    { data: outflows },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("clientid,fullnameorcompanyname"),

    supabase
      .from("projects")
      .select("projectid,projecttitle,clientid"),

    supabase
      .from("suppliers")
      .select("supplierid,suppliername")
      .eq("status", "Active"),

    supabase
      .from("subcontractors")
      .select("subcontractorid,subcontractorname")
      .eq("status", "Active"),

    supabase
      .from("cashinflowreceivables")
      .select(
        "transactionid,sourceofcash,clientid,projectid,department,amount,transactiondate,paymentmethod,description,makeruserid,approvalstatus,checkeruserid,rejectionreason",
      )
      .order("transactiondate", {
        ascending: false,
      }),

    supabase
      .from("cashoutflowexpenditure")
      .select(
        "transactionid,projectid,supplierid,subcontractorid,expenditurecategory,amount,transactiondate,paymentmethod,description,makeruserid,approvalstatus,checkeruserid,rejectionreason",
      )
      .order("transactiondate", {
        ascending: false,
      }),
  ]);

  const projectNames = new Map(
    (projects ?? []).map((project) => [
      project.projectid,
      project.projecttitle,
    ]),
  );

  const clientNames = new Map(
    (clients ?? []).map((client) => [
      client.clientid,
      client.fullnameorcompanyname,
    ]),
  );

  const supplierNames = new Map(
    (suppliers ?? []).map((supplier) => [
      supplier.supplierid,
      supplier.suppliername,
    ]),
  );

  const subcontractorNames = new Map(
    (subcontractors ?? []).map((subcontractor) => [
      subcontractor.subcontractorid,
      subcontractor.subcontractorname,
    ]),
  );

  const detailedInflows = (inflows ?? []).map((row) => ({
    ...row,

    projectname: row.projectid
      ? projectNames.get(row.projectid) ?? row.projectid
      : null,

    clientname: row.clientid
      ? clientNames.get(row.clientid) ?? row.clientid
      : null,
  }));

  const detailedOutflows = (outflows ?? []).map((row) => ({
    ...row,

    projectname:
      projectNames.get(row.projectid) ?? row.projectid,

    payeetype: row.supplierid
      ? "Supplier"
      : row.subcontractorid
        ? "Subcontractor"
        : "In-House",

    payeename: row.supplierid
      ? supplierNames.get(row.supplierid) ?? row.supplierid
      : row.subcontractorid
        ? subcontractorNames.get(row.subcontractorid) ??
          row.subcontractorid
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