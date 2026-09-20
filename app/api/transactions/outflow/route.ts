import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireApiWriteAccess } from "@/lib/viewer";
import { nextPrefixedId } from "@/lib/client-utils";

export async function POST(request: Request) {
  const { viewer, forbidden } =
    await requireApiWriteAccess("transactions");

  if (forbidden || !viewer) {
    return NextResponse.json(
      {
        error: "Not authorized to submit expenditure.",
      },
      { status: 403 },
    );
  }

  if (viewer.roleName === "Authorizer") {
    return NextResponse.json(
      {
        error: "Authorizers cannot submit new transactions.",
      },
      { status: 403 },
    );
  }

  const body = await request.json();

  const projectid = String(body.projectid ?? "").trim();
  const payeetype = String(body.payeetype ?? "").trim();
  const payeeid = body.payeeid
    ? String(body.payeeid).trim()
    : null;
  const category = String(body.category ?? "").trim();
  const amount = Number(body.amount);
  const transactionDate = String(body.date ?? "").trim();
  const paymentMethod = String(body.method ?? "").trim();
  const description =
    String(body.description ?? "").trim() || null;

  if (!projectid) {
    return NextResponse.json(
      {
        error: "Project is required.",
      },
      { status: 400 },
    );
  }

  if (
    !["Supplier", "Subcontractor", "In-House"].includes(
      payeetype,
    )
  ) {
    return NextResponse.json(
      {
        error: "Invalid payee type.",
      },
      { status: 400 },
    );
  }

  if (payeetype !== "In-House" && !payeeid) {
    return NextResponse.json(
      {
        error: `${payeetype} is required.`,
      },
      { status: 400 },
    );
  }

  if (!category) {
    return NextResponse.json(
      {
        error: "Expense category is required.",
      },
      { status: 400 },
    );
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      {
        error: "Amount must be greater than zero.",
      },
      { status: 400 },
    );
  }

  if (!transactionDate) {
    return NextResponse.json(
      {
        error: "Request date is required.",
      },
      { status: 400 },
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  if (transactionDate < today) {
    return NextResponse.json(
      {
        error: "Transaction dates cannot be in the past.",
      },
      { status: 400 },
    );
  }

  if (
    !["Bank Transfer", "Cheque"].includes(paymentMethod)
  ) {
    return NextResponse.json(
      {
        error: "Invalid payment method.",
      },
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
      {
        error: "Project not found.",
      },
      { status: 404 },
    );
  }

  const isPendingProject = project.status === "Pending";

  const { data: categoryRow } = await supabase
    .from("transactioncategories")
    .select("categoryid,categoryname,isinhouse,active")
    .eq("categoryname", category)
    .eq("active", true)
    .single();

  if (!categoryRow) {
    return NextResponse.json(
      {
        error: "The selected expense category is no longer active.",
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

  if (payeetype === "Supplier") {
    const { data: supplier } = await supabase
      .from("suppliers")
      .select("supplierid,status")
      .eq("supplierid", payeeid)
      .single();

    if (!supplier) {
      return NextResponse.json(
        {
          error: "Supplier not found.",
        },
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

  if (payeetype === "Subcontractor") {
    const { data: subcontractor } = await supabase
      .from("subcontractors")
      .select("subcontractorid,status")
      .eq("subcontractorid", payeeid)
      .single();

    if (!subcontractor) {
      return NextResponse.json(
        {
          error: "Subcontractor not found.",
        },
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
    (existing ?? []).map(
      (row) => row.transactionid,
    ),
    "OUT",
    9,
  );

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
      {
        error: error.message,
      },
      { status: 400 },
    );
  }

  await supabase.from("makercheckerauditlog").insert({
    logid: `LOG${Date.now().toString().slice(-9)}`,
    transactiontype: "Cash Outflow",
    transactionid: id,
    actiontype: "Created",
    actionbyuserid: viewer.userId,
    actiondate: today,
    actiontime: new Date()
      .toTimeString()
      .slice(0, 8),
    comments: isPendingProject
      ? "Submitted against a project with Pending status. Approval will require an explicit override."
      : null,
  });

  return NextResponse.json(
    {
      transactionid: id,
      projectPending: isPendingProject,
    },
    { status: 201 },
  );
}