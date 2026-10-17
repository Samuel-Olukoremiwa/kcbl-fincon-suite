
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireApiWriteAccess } from "@/lib/viewer";
import { nextPrefixedId } from "@/lib/client-utils";

const ALLOW_UNASSIGNED_PAYEES =
  process.env.NEXT_PUBLIC_ALLOW_UNASSIGNED_EXPENSE_PAYEES ===
  "true";

function currentLagosDate() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

export async function POST(request: Request) {
  const { viewer, forbidden } =
    await requireApiWriteAccess("transactions");

  if (forbidden || !viewer) {
    return NextResponse.json(
      { error: "Not authorized to submit expenditure." },
      { status: 403 },
    );
  }

  if (viewer.roleName === "Authorizer") {
    return NextResponse.json(
      {
        error:
          "Authorizers cannot submit new transactions.",
      },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const projectid = String(body.projectid ?? "").trim();
  const payeetype = String(body.payeetype ?? "").trim();
  const payeeid = body.payeeid
    ? String(body.payeeid).trim() || null
    : null;
  const category = String(body.category ?? "").trim();
  const amount = Number(body.amount);
  const transactionDate = String(body.date ?? "").trim();
  const paymentMethod = String(body.method ?? "").trim();
  const description =
    String(body.description ?? "").trim() || null;

  if (!projectid) {
    return NextResponse.json(
      { error: "Project is required." },
      { status: 400 },
    );
  }

  if (
    !["Supplier", "Subcontractor", "In-House"].includes(
      payeetype,
    )
  ) {
    return NextResponse.json(
      { error: "Invalid payee type." },
      { status: 400 },
    );
  }

  if (
    payeetype !== "In-House" &&
    !payeeid &&
    !ALLOW_UNASSIGNED_PAYEES
  ) {
    return NextResponse.json(
      { error: `${payeetype} is required.` },
      { status: 400 },
    );
  }

  if (!category) {
    return NextResponse.json(
      { error: "Expense category is required." },
      { status: 400 },
    );
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "Amount must be greater than zero." },
      { status: 400 },
    );
  }

  if (!transactionDate) {
    return NextResponse.json(
      { error: "Transaction date is required." },
      { status: 400 },
    );
  }

  const today = currentLagosDate();

  if (transactionDate > today) {
    return NextResponse.json(
      {
        error: "Transaction dates cannot be in the future.",
      },
      { status: 400 },
    );
  }

  if (
    !["Bank Transfer", "Cheque"].includes(paymentMethod)
  ) {
    return NextResponse.json(
      { error: "Invalid payment method." },
      { status: 400 },
    );
  }

  const supabase = createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("status")
    .eq("projectid", projectid)
    .single();

  if (!project) {
    return NextResponse.json(
      { error: "Project not found." },
      { status: 404 },
    );
  }

  const isPendingProject = project.status === "Pending";

  const { data: categoryRow } = await supabase
    .from("transactioncategories")
    .select(
      "categoryid,categoryname,isinhouse,active",
    )
    .eq("categoryname", category)
    .eq("active", true)
    .single();

  if (!categoryRow) {
    return NextResponse.json(
      {
        error:
          "The selected expense category is no longer active.",
      },
      { status: 400 },
    );
  }

  if (
    payeetype === "In-House" &&
    !categoryRow.isinhouse
  ) {
    return NextResponse.json(
      {
        error:
          "The selected category is not an in-house category.",
      },
      { status: 400 },
    );
  }

  if (
    payeetype !== "In-House" &&
    categoryRow.isinhouse
  ) {
    return NextResponse.json(
      {
        error:
          "An in-house category cannot be used for a supplier or subcontractor.",
      },
      { status: 400 },
    );
  }

  if (payeetype === "Supplier" && payeeid) {
    const { data: supplier } = await supabase
      .from("suppliers")
      .select("supplierid,status")
      .eq("supplierid", payeeid)
      .single();

    if (!supplier) {
      return NextResponse.json(
        { error: "Supplier not found." },
        { status: 404 },
      );
    }

    if (supplier.status !== "Active") {
      return NextResponse.json(
        {
          error: "The selected supplier is inactive.",
        },
        { status: 400 },
      );
    }
  }

  if (payeetype === "Subcontractor" && payeeid) {
    const { data: subcontractor } = await supabase
      .from("subcontractors")
      .select("subcontractorid,status")
      .eq("subcontractorid", payeeid)
      .single();

    if (!subcontractor) {
      return NextResponse.json(
        { error: "Subcontractor not found." },
        { status: 404 },
      );
    }

    if (subcontractor.status !== "Active") {
      return NextResponse.json(
        {
          error: "The selected subcontractor is inactive.",
        },
        { status: 400 },
      );
    }
  }

  const { data: existing } = await supabase
    .from("cashoutflowexpenditure")
    .select("transactionid");

  const id = nextPrefixedId(
    (existing ?? []).map((row) => row.transactionid),
    "OUT",
    9,
  );

  const unassignedPayee =
    payeetype !== "In-House" && !payeeid;

  const { error } = await supabase
    .from("cashoutflowexpenditure")
    .insert({
      transactionid: id,
      projectid,
      supplierid:
        payeetype === "Supplier" ? payeeid : null,
      subcontractorid:
        payeetype === "Subcontractor" ? payeeid : null,
      expenditurecategory: category,
      amount,
      transactiondate: transactionDate,
      paymentmethod: paymentMethod,
      description,
      makeruserid: viewer.userId,
      approvalstatus: "Pending",
    });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 },
    );
  }

  const auditComments: string[] = [];

  if (transactionDate < today) {
    auditComments.push(
      `Backdated entry. Transaction date: ${transactionDate}; entered in FinCon on ${today}.`,
    );
  }

  if (isPendingProject) {
    auditComments.push(
      "Submitted against a project with Pending status. Approval will require an explicit override.",
    );
  }

  if (unassignedPayee) {
    auditComments.push(
      `Historical backlog entry: ${payeetype} not yet assigned. Payee reconciliation required.`,
    );
  }

  const { error: auditError } = await supabase
    .from("makercheckerauditlog")
    .insert({
      logid: `LOG${Date.now().toString().slice(-9)}`,
      transactiontype: "Cash Outflow",
      transactionid: id,
      actiontype: "Created",
      actionbyuserid: viewer.userId,
      actiondate: today,
      actiontime: new Date()
        .toTimeString()
        .slice(0, 8),
      comments:
        auditComments.length > 0
          ? auditComments.join(" ")
          : null,
    });

  if (auditError) {
    console.error(
      "Cash outflow audit log failed:",
      auditError,
    );
  }

  return NextResponse.json(
    {
      transactionid: id,
      projectPending: isPendingProject,
      payeeReconciliationRequired: unassignedPayee,
    },
    { status: 201 },
  );
}
