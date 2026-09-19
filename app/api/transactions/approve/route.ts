import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/viewer";

export async function POST(request: Request) {
  const viewer = await requireStaff();
  if (!["Authorizer", "MD", "Super User"].includes(viewer.roleName)) {
    return NextResponse.json({ error: "Not authorized to approve transactions." }, { status: 403 });
  }

  const body = await request.json();
  const { table, transactionid, status, reason, kind, makeruserid, override, overridereason } = body as {
    table: "cashinflowreceivables" | "cashoutflowexpenditure";
    transactionid: string;
    status: "Approved" | "Rejected";
    reason: string | null;
    kind: "Cash Inflow" | "Cash Outflow";
    makeruserid: string;
    override?: boolean;
    overridereason?: string | null;
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

  let projectPending = false;
  if (status === "Approved" && table === "cashoutflowexpenditure" && transaction.projectid) {
    const { data: project } = await supabase.from("projects").select("status").eq("projectid", transaction.projectid).single();
    projectPending = project?.status === "Pending";

    // Approving an outflow against a Pending project requires an explicit,
    // reasoned override rather than being silently allowed or silently blocked.
    if (projectPending && !override) {
      return NextResponse.json(
        {
          error: "This project's status is Pending. Approving this expense requires an override.",
          requiresOverride: true,
        },
        { status: 409 },
      );
    }
    if (projectPending && override && !overridereason) {
      return NextResponse.json({ error: "An override reason is required." }, { status: 400 });
    }

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

  // Separate, explicit trail entry for the override — kept distinct from the
  // normal Approved entry so the override itself is individually attributable.
  if (projectPending && override) {
    await supabase.from("makercheckerauditlog").insert({
      logid: `LOG${(Date.now() + 1).toString().slice(-9)}`,
      transactiontype: kind,
      transactionid,
      actiontype: "Overridden",
      actionbyuserid: viewer.userId,
      actiondate: new Date().toISOString().slice(0, 10),
      actiontime: new Date().toTimeString().slice(0, 8),
      comments: `Approved against a Pending project. Reason: ${overridereason}`,
    });
  }

  return NextResponse.json({ ok: true });
}