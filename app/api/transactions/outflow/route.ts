import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireApiWriteAccess } from "@/lib/viewer";
import { nextPrefixedId } from "@/lib/client-utils";

export async function POST(request: Request) {
  const { viewer, forbidden } = await requireApiWriteAccess("transactions");
  if (forbidden || !viewer) {
    return NextResponse.json({ error: "Not authorized to submit expenditure." }, { status: 403 });
  }
  if (viewer.roleName === "Authorizer") {
    return NextResponse.json({ error: "Authorizers cannot submit new transactions." }, { status: 403 });
  }

  const body = await request.json();
  const today = new Date().toISOString().slice(0, 10);
  if (!body.date || body.date < today) {
    return NextResponse.json({ error: "Transaction dates cannot be in the past." }, { status: 400 });
  }
  const supabase = createClient();
  const { data: project } = await supabase.from("projects").select("status").eq("projectid", body.projectid).single();

  // Pending projects no longer block the request outright — it now goes
  // through to the approval queue, flagged in the audit trail, where an
  // Authorizer/MD/Super User can approve it via an explicit override.
  const isPendingProject = project?.status === "Pending";

  const { data: existing } = await supabase.from("cashoutflowexpenditure").select("transactionid");
  const id = nextPrefixedId((existing ?? []).map((x) => x.transactionid), "OUT", 9);

  const { error } = await supabase.from("cashoutflowexpenditure").insert({
    transactionid: id,
    projectid: body.projectid,
    supplierid: body.payeetype === "Supplier" ? body.payeeid : null,
    subcontractorid: body.payeetype === "Subcontractor" ? body.payeeid : null,
    expenditurecategory: body.category,
    amount: Number(body.amount),
    transactiondate: body.date,
    paymentmethod: body.method,
    description: body.description || null,
    makeruserid: viewer.userId,
    approvalstatus: "Pending",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from("makercheckerauditlog").insert({
    logid: "LOG" + Date.now().toString().slice(-9),
    transactiontype: "Cash Outflow",
    transactionid: id,
    actiontype: "Created",
    actionbyuserid: viewer.userId,
    actiondate: new Date().toISOString().slice(0, 10),
    actiontime: new Date().toTimeString().slice(0, 8),
    comments: isPendingProject
      ? "Submitted against a project with Pending status. Approval will require an explicit override."
      : null,
  });

  return NextResponse.json({ transactionid: id, projectPending: isPendingProject });
}