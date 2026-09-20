import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/viewer";

const TRANSACTION_TABLES = [
  "cashinflowreceivables",
  "cashoutflowexpenditure",
] as const;

type TransactionTable =
  (typeof TRANSACTION_TABLES)[number];

type ApprovalStatus = "Approved" | "Rejected";

function isTransactionTable(
  value: unknown,
): value is TransactionTable {
  return (
    value === "cashinflowreceivables" ||
    value === "cashoutflowexpenditure"
  );
}

function createLogId() {
  return `LOG${Date.now().toString().slice(-9)}`;
}

export async function POST(request: Request) {
  const viewer = await requireStaff();

  if (
    !["Authorizer", "MD", "Super User"].includes(
      viewer.roleName,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Not authorized to approve transactions.",
      },
      { status: 403 },
    );
  }

  let body: any;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid request body.",
      },
      { status: 400 },
    );
  }

  const table = body.table;

  const transactionid = String(
    body.transactionid ?? "",
  ).trim();

  const status = body.status as ApprovalStatus;

  const reason =
    typeof body.reason === "string"
      ? body.reason.trim()
      : null;

  const override = body.override === true;

  const overridereason =
    typeof body.overridereason === "string"
      ? body.overridereason.trim()
      : null;

  if (!isTransactionTable(table)) {
    return NextResponse.json(
      {
        error: "Invalid transaction type.",
      },
      { status: 400 },
    );
  }

  if (!transactionid) {
    return NextResponse.json(
      {
        error: "Transaction ID is required.",
      },
      { status: 400 },
    );
  }

  if (
    status !== "Approved" &&
    status !== "Rejected"
  ) {
    return NextResponse.json(
      {
        error: "Invalid approval status.",
      },
      { status: 400 },
    );
  }

  if (status === "Rejected" && !reason) {
    return NextResponse.json(
      {
        error: "A rejection reason is required.",
      },
      { status: 400 },
    );
  }

  if (status === "Rejected" && override) {
    return NextResponse.json(
      {
        error:
          "An override can only be used when approving an expense.",
      },
      { status: 400 },
    );
  }

  if (
    override &&
    table !== "cashoutflowexpenditure"
  ) {
    return NextResponse.json(
      {
        error:
          "Overrides are only available for cash outflow approvals.",
      },
      { status: 400 },
    );
  }

  if (override && !overridereason) {
    return NextResponse.json(
      {
        error: "An override reason is required.",
      },
      { status: 400 },
    );
  }

  const supabase = createClient();

  const { data: transaction, error: transactionError } =
    await supabase
      .from(table)
      .select(
        "transactionid,transactiondate,projectid,amount,makeruserid,approvalstatus",
      )
      .eq("transactionid", transactionid)
      .single();

  if (transactionError || !transaction) {
    return NextResponse.json(
      {
        error: "Transaction not found.",
      },
      { status: 404 },
    );
  }

  if (transaction.approvalstatus !== "Pending") {
    return NextResponse.json(
      {
        error: `This transaction has already been ${String(
          transaction.approvalstatus,
        ).toLowerCase()}.`,
      },
      { status: 409 },
    );
  }

  /*
   * Maker-checker separation is enforced on the
   * server, not only in the UI.
   */
  if (transaction.makeruserid === viewer.userId) {
    return NextResponse.json(
      {
        error:
          "You cannot approve your own transaction.",
      },
      { status: 400 },
    );
  }

  let projectPending = false;

  /*
   * Cash-out approvals linked to projects must
   * respect the project's status and approved
   * cash position.
   */
  if (
    status === "Approved" &&
    table === "cashoutflowexpenditure" &&
    transaction.projectid
  ) {
    const { data: project, error: projectError } =
      await supabase
        .from("projects")
        .select("status")
        .eq("projectid", transaction.projectid)
        .single();

    if (projectError || !project) {
      return NextResponse.json(
        {
          error:
            "The project linked to this expense could not be found.",
        },
        { status: 400 },
      );
    }

    projectPending = project.status === "Pending";

    if (projectPending && !override) {
      return NextResponse.json(
        {
          error:
            "This project's status is Pending. Approving this expense requires an override.",
          requiresOverride: true,
        },
        { status: 409 },
      );
    }

    if (projectPending && override && !overridereason) {
      return NextResponse.json(
        {
          error: "An override reason is required.",
        },
        { status: 400 },
      );
    }

    const [{ data: inflows }, { data: outflows }] =
      await Promise.all([
        supabase
          .from("cashinflowreceivables")
          .select("amount")
          .eq(
            "projectid",
            transaction.projectid,
          )
          .eq("approvalstatus", "Approved"),

        supabase
          .from("cashoutflowexpenditure")
          .select("amount")
          .eq(
            "projectid",
            transaction.projectid,
          )
          .eq("approvalstatus", "Approved"),
      ]);

    const approvedInflows =
      (inflows ?? []).reduce(
        (sum, row) =>
          sum + Number(row.amount),
        0,
      );

    const approvedOutflows =
      (outflows ?? []).reduce(
        (sum, row) =>
          sum + Number(row.amount),
        0,
      );

    const cashPosition =
      approvedInflows - approvedOutflows;

    /*
     * MD and Super User may approve an outflow
     * exceeding the current approved project cash
     * position. Other authorizers cannot.
     */
    if (
      Number(transaction.amount) >
        cashPosition &&
      !["MD", "Super User"].includes(
        viewer.roleName,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "This outflow exceeds the approved project cash position and requires MD authorization.",
        },
        { status: 403 },
      );
    }
  }

  /*
   * An override is only valid when a Pending
   * project actually required one.
   */
  if (override && !projectPending) {
    return NextResponse.json(
      {
        error:
          "This transaction does not require a project-status override.",
      },
      { status: 400 },
    );
  }

  const approvalDate = new Date()
    .toISOString()
    .slice(0, 10);

  /*
   * Re-check Pending during the update itself.
   * This prevents two simultaneous approval attempts
   * from both processing the same transaction.
   */
  const {
    data: updatedTransaction,
    error: updateError,
  } = await supabase
    .from(table)
    .update({
      approvalstatus: status,
      checkeruserid: viewer.userId,
      approvaldate: approvalDate,
      rejectionreason:
        status === "Rejected"
          ? reason
          : null,
    })
    .eq("transactionid", transactionid)
    .eq("approvalstatus", "Pending")
    .select("transactionid")
    .maybeSingle();

  if (updateError) {
    return NextResponse.json(
      {
        error: updateError.message,
      },
      { status: 400 },
    );
  }

  if (!updatedTransaction) {
    return NextResponse.json(
      {
        error:
          "This transaction was already processed by another authorization attempt.",
      },
      { status: 409 },
    );
  }

  const transactionType =
    table === "cashinflowreceivables"
      ? "Cash Inflow"
      : "Cash Outflow";

  const actionTime = new Date()
    .toTimeString()
    .slice(0, 8);

  /*
   * Normal approval/rejection audit record.
   */
  const { error: auditError } =
    await supabase
      .from("makercheckerauditlog")
      .insert({
        logid: createLogId(),
        transactiontype: transactionType,
        transactionid,
        actiontype: status,
        actionbyuserid: viewer.userId,
        actiondate: approvalDate,
        actiontime: actionTime,
        comments: reason || null,
      });

  if (auditError) {
    /*
     * The transaction has already been processed.
     * Return success with a warning rather than
     * incorrectly telling the client that approval
     * failed.
     */
    return NextResponse.json({
      ok: true,
      warning:
        "The transaction was processed, but the audit entry could not be written.",
      auditError: auditError.message,
      transactionid,
      status,
    });
  }

  /*
   * Pending-project overrides are recorded as a
   * separate audit event because the database now
   * explicitly permits the "Overridden" action type.
   */
  if (projectPending && override) {
    const { error: overrideAuditError } =
      await supabase
        .from("makercheckerauditlog")
        .insert({
          logid: createLogId(),
          transactiontype: transactionType,
          transactionid,
          actiontype: "Overridden",
          actionbyuserid: viewer.userId,
          actiondate: approvalDate,
          actiontime: new Date()
            .toTimeString()
            .slice(0, 8),
          comments: `Approved against a Pending project. Reason: ${overridereason}`,
        });

    if (overrideAuditError) {
      return NextResponse.json({
        ok: true,
        warning:
          "The transaction was approved, but the override audit entry could not be written.",
        auditError:
          overrideAuditError.message,
        transactionid,
        status,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    transactionid,
    status,
  });
}