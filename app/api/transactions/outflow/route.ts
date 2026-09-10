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
  const supabase = createClient();
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
  });

  return NextResponse.json({ transactionid: id });
}