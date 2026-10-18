
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireApiWriteAccess } from "@/lib/viewer";
import { nextPrefixedId } from "@/lib/client-utils";

const ALLOW_UNASSIGNED_PAYEES =
  process.env.NEXT_PUBLIC_ALLOW_UNASSIGNED_EXPENSE_PAYEES ===
  "true";

type ExpenseLine = {
  category: string;
  amount: string;
};

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

  const rawLines = Array.isArray(body.categories)
    ? body.categories
    : [{ category: body.category, amount: body.amount }];

  if (rawLines.length < 1 || rawLines.length > 30) {
    return NextResponse.json(
      {
        error:
          "Choose between 1 and 30 expense categories.",
      },
      { status: 400 },
    );
  }

  const breakdown: ExpenseLine[] = [];
  let totalCents = 0;

  const seenCategories = new Set<string>();

  for (const raw of rawLines) {
    const categoryName = String(
      raw?.category ?? "",
    ).trim();

    const amountText = String(
      raw?.amount ?? "",
    )
      .replace(/,/g, "")
      .trim();

    if (
      !categoryName ||
      seenCategories.has(categoryName)
    ) {
      return NextResponse.json(
        {
          error:
            "Select unique, nonempty expense categories.",
        },
        { status: 400 },
      );
    }

    if (
      !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(
        amountText,
      )
    ) {
      return NextResponse.json(
        {
          error:
            `Invalid amount for ${categoryName}. Use up to two decimal places.`,
        },
        { status: 400 },
      );
    }

    const numeric = Number(amountText);
    const cents = Math.round(numeric * 100);

    if (
      !Number.isSafeInteger(cents) ||
      cents <= 0
    ) {
      return NextResponse.json(
        {
          error:
            `Enter a positive amount for ${categoryName}.`,
        },
        { status: 400 },
      );
    }

    seenCategories.add(categoryName);
    totalCents += cents;

    if (!Number.isSafeInteger(totalCents)) {
      return NextResponse.json(
        {
          error:
            "Expense total exceeds allowed range.",
        },
        { status: 400 },
      );
    }

    breakdown.push({
      category: categoryName,
      amount: (cents / 100).toFixed(2),
    });
  }

  const category = breakdown[0].category;
  const amount = totalCents / 100;

  const transactionDate = String(
    body.date ?? "",
  ).trim();

  const paymentMethod = String(
    body.method ?? "",
  ).trim();

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

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return NextResponse.json(
      {
        error: "Amount must be greater than zero.",
      },
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
        error:
          "Transaction dates cannot be in the future.",
      },
      { status: 400 },
    );
  }

  if (
    !["Bank Transfer", "Cheque"].includes(
      paymentMethod,
    )
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

  const isPendingProject =
    project.status === "Pending";

  /*
   * CATEGORY VALIDATION
   *
   * Shared categories work for all payee types.
   * Other categories must match their original
   * In-House/non-In-House classification.
   */
  const {
    data: categoryRows,
    error: categoryError,
  } = await supabase
    .from("transactioncategories")
    .select(
      "categoryname,isinhouse,availableforall,active",
    )
    .in(
      "categoryname",
      breakdown.map((line) => line.category),
    )
    .eq("active", true);

  if (
    categoryError ||
    (categoryRows ?? []).length !== breakdown.length
  ) {
    return NextResponse.json(
      {
        error:
          "One or more selected expense categories are unavailable.",
      },
      { status: 400 },
    );
  }

  const isInternalExpense =
    payeetype === "In-House";

  const invalidCategory = (
    categoryRows ?? []
  ).find(
    (row) =>
      !row.availableforall &&
      Boolean(row.isinhouse) !== isInternalExpense,
  );

  if (invalidCategory) {
    return NextResponse.json(
      {
        error:
          `Category "${invalidCategory.categoryname}" is not available for ${payeetype} expenses.`,
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
    const { data: subcontractor } =
      await supabase
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
          error:
            "The selected subcontractor is inactive.",
        },
        { status: 400 },
      );
    }
  }

  const { data: existing } = await supabase
    .from("cashoutflowexpenditure")
    .select("transactionid");

  const id = nextPrefixedId(
    (existing ?? []).map(
      (row) => row.transactionid,
    ),
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
        payeetype === "Supplier"
          ? payeeid
          : null,

      subcontractorid:
        payeetype === "Subcontractor"
          ? payeeid
          : null,

      expenditurecategory: category,
      expensepayeetype: payeetype,
      expensebreakdown: breakdown,
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

  const {
    error: auditError,
  } = await supabase
    .from("makercheckerauditlog")
    .insert({
      logid:
        `LOG${Date.now().toString().slice(-9)}`,
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
