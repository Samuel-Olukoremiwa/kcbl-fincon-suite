import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/viewer";

export async function POST(request: Request) {
  const viewer = await requireStaff();
  if (!["Authorizer", "MD", "Super User"].includes(viewer.roleName)) {
    return NextResponse.json({ error: "Not authorized to approve transactions." }, { status: 403 });
  }

  const body = await request.json();
  const { table, transactionid, status, reason, kind, makeruserid } = body as {
    table: "cashinflowreceivables" | "cashoutflowexpenditure";
    transactionid: string;
    status: "Approved" | "Rejected";
    reason: string | null;
    kind: "Cash Inflow" | "Cash Outflow";
    makeruserid: string;
  };

  if (status === "Rejected" && !reason) {
    return NextResponse.json({ error: "A rejection reason is required." }, { status: 400 });
  }
  if (makeruserid === viewer.userId) {
    return NextResponse.json({ error: "You cannot approve your own transaction." }, { status: 400 });
  }

  const supabase = createClient();
  const { data: transaction } = await supabase.from(table).select("transactiondate, projectid, amount").eq("transactionid", transactionid).single();
  if (!transaction) return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
  if (status === "Approved" && table === "cashoutflowexpenditure" && transaction.projectid) {
    const [{ data: inflows }, { data: outflows }] = await Promise.all([
      supabase.from("cashinflowreceivables").select("amount").eq("projectid", transaction.projectid).eq("approvalstatus", "Approved"),
      supabase.from("cashoutflowexpenditure").select("amount").eq("projectid", transaction.projectid).eq("approvalstatus", "Approved"),
    ]);
    const cashPosition = (inflows ?? []).reduce((sum, row) => sum + Number(row.amount), 0) - (outflows ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
    if (Number(transaction.amount) > cashPosition && !["MD", "Super User"].includes(viewer.roleName)) {
      return NextResponse.json({ error: "This outflow exceeds the approved project cash position and requires MD authorization." }, { status: 403 });
    }
  }
  const { error } = await supabase
    .from(table)
    .update({
      approvalstatus: status,
      checkeruserid: viewer.userId,
      approvaldate: new Date().toISOString().slice(0, 10),
      rejectionreason: status === "Rejected" ? reason : null,
    })
    .eq("transactionid", transactionid);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from("makercheckerauditlog").insert({
    logid: `LOG${Date.now().toString().slice(-9)}`,
    transactiontype: kind,
    transactionid,
    actiontype: status,
    actionbyuserid: viewer.userId,
    actiondate: new Date().toISOString().slice(0, 10),
    actiontime: new Date().toTimeString().slice(0, 8),
    comments: reason || null,
  });

  return NextResponse.json({ ok: true });
}
