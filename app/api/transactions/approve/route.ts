import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/viewer";

export async function POST(request: Request) {
  const viewer = await requireStaff();
  if (!["Authorizer", "Super User"].includes(viewer.roleName)) {
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