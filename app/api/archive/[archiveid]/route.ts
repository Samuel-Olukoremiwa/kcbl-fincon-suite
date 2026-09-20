import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/viewer";

export async function GET(
  request: Request,
  { params }: { params: { archiveid: string } },
) {
  const viewer = await requireStaff();

  const allowed =
    viewer.roleName === "Super User" ||
    viewer.department === "Audit/Internal Control" ||
    viewer.department === "Finance & Admin" ||
    viewer.department === "MD Office";

  if (!allowed) {
    return NextResponse.json(
      { error: "Not authorized." },
      { status: 403 },
    );
  }

  const archiveid = Number(params.archiveid);

  if (!Number.isInteger(archiveid) || archiveid <= 0) {
    return NextResponse.json(
      { error: "Invalid archive ID." },
      { status: 400 },
    );
  }

  const supabase = createClient();

  const [
    { data: batch, error: batchError },
    { data: clients, error: clientsError },
    { data: projects, error: projectsError },
    { data: suppliers, error: suppliersError },
    { data: subcontractors, error: subcontractorsError },
    { data: inflows, error: inflowsError },
    { data: outflows, error: outflowsError },
  ] = await Promise.all([
    supabase
      .from("archivebatches")
      .select(
        "archiveid,financialyear,halfyear,archivedat,archivedbyuserid",
      )
      .eq("archiveid", archiveid)
      .maybeSingle(),

    supabase
      .from("clients")
      .select(
        "clientid,fullnameorcompanyname,clienttype",
      )
      .eq("archiveid", archiveid),

    supabase
      .from("projects")
      .select(
        "projectid,projecttitle,estimatedvalue,status",
      )
      .eq("archiveid", archiveid),

    supabase
      .from("suppliers")
      .select(
        "supplierid,suppliername,supplycategory",
      )
      .eq("archiveid", archiveid),

    supabase
      .from("subcontractors")
      .select(
        "subcontractorid,subcontractorname,tradespecialty",
      )
      .eq("archiveid", archiveid),

    supabase
      .from("cashinflowreceivables")
      .select(
        "transactionid,amount,transactiondate,paymentmethod,description,approvalstatus,clientid,projectid",
      )
      .eq("archiveid", archiveid),

    supabase
      .from("cashoutflowexpenditure")
      .select(
        "transactionid,amount,transactiondate,paymentmethod,description,approvalstatus,projectid,supplierid,subcontractorid",
      )
      .eq("archiveid", archiveid),
  ]);

  const error =
    batchError ||
    clientsError ||
    projectsError ||
    suppliersError ||
    subcontractorsError ||
    inflowsError ||
    outflowsError;

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 },
    );
  }

  if (!batch) {
    return NextResponse.json(
      { error: "Archive batch not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    batch,
    clients: clients ?? [],
    projects: projects ?? [],
    suppliers: suppliers ?? [],
    subcontractors: subcontractors ?? [],
    inflows: inflows ?? [],
    outflows: outflows ?? [],
  });
}