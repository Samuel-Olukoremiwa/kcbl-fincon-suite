import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireApiWriteAccess } from "@/lib/viewer";
import { nextPrefixedId } from "@/lib/client-utils";

const VALID_SOURCES = ["Client", "Department"] as const;

const VALID_DEPARTMENTS = [
  "MD",
  "MD Office",
  "Executive Director",
  "Non-Executive Director",
  "Finance & Admin",
  "Business Development",
  "Operations",
  "Audit/Internal Control",
];

const VALID_PAYMENT_METHODS = [
  "Bank Transfer",
  "Cheque",
];

export async function POST(request: Request) {
  const { viewer, forbidden } =
    await requireApiWriteAccess("transactions");

  if (forbidden || !viewer) {
    return NextResponse.json(
      {
        error:
          "Not authorized to submit cash inflow.",
      },
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
      {
        error: "Invalid request body.",
      },
      { status: 400 },
    );
  }

  const sourceofcash = String(
    body.sourceofcash ?? "",
  ).trim();

  const clientid = String(
    body.clientid ?? "",
  ).trim();

  const projectid = String(
    body.projectid ?? "",
  ).trim();

  const department = String(
    body.department ?? "",
  ).trim();

  const amount = Number(body.amount);

  const transactionDate = String(
    body.date ?? "",
  ).trim();

  const paymentMethod = String(
    body.method ?? "",
  ).trim();

  const description = String(
    body.description ?? "",
  ).trim();

  if (
    !VALID_SOURCES.includes(
      sourceofcash as (typeof VALID_SOURCES)[number],
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Select a valid Source of Cash.",
      },
      { status: 400 },
    );
  }

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return NextResponse.json(
      {
        error:
          "Amount must be greater than zero.",
      },
      { status: 400 },
    );
  }

  if (!transactionDate) {
    return NextResponse.json(
      {
        error:
          "Transaction date is required.",
      },
      { status: 400 },
    );
  }

  const today = new Date()
    .toISOString()
    .slice(0, 10);

  if (transactionDate < today) {
    return NextResponse.json(
      {
        error:
          "Transaction dates cannot be in the past.",
      },
      { status: 400 },
    );
  }

  if (
    !VALID_PAYMENT_METHODS.includes(
      paymentMethod,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid payment method.",
      },
      { status: 400 },
    );
  }

  if (!description) {
    return NextResponse.json(
      {
        error:
          "Description is required.",
      },
      { status: 400 },
    );
  }

  const supabase = createClient();

  /*
   * ----------------------------------------------------------
   * CLIENT-SOURCED INFLOW
   * ----------------------------------------------------------
   */
  if (sourceofcash === "Client") {
    if (!clientid) {
      return NextResponse.json(
        {
          error:
            "Client is required when the Source of Cash is Client.",
        },
        { status: 400 },
      );
    }

    if (!projectid) {
      return NextResponse.json(
        {
          error:
            "Project is required when the Source of Cash is Client.",
        },
        { status: 400 },
      );
    }

    const { data: client } =
      await supabase
        .from("clients")
        .select("clientid")
        .eq("clientid", clientid)
        .maybeSingle();

    if (!client) {
      return NextResponse.json(
        {
          error: "Client not found.",
        },
        { status: 404 },
      );
    }

    /*
     * The selected project must actually belong
     * to the selected client.
     */
    const { data: project } =
      await supabase
        .from("projects")
        .select(
          "projectid,clientid,status",
        )
        .eq("projectid", projectid)
        .maybeSingle();

    if (!project) {
      return NextResponse.json(
        {
          error: "Project not found.",
        },
        { status: 404 },
      );
    }

    if (project.clientid !== clientid) {
      return NextResponse.json(
        {
          error:
            "The selected project does not belong to the selected Source of Cash.",
        },
        { status: 400 },
      );
    }

    if (project.status === "Pending") {
      return NextResponse.json(
        {
          error:
            "Pending projects do not accept new financial records.",
        },
        { status: 400 },
      );
    }
  }

  /*
   * ----------------------------------------------------------
   * DEPARTMENT-SOURCED INFLOW
   * ----------------------------------------------------------
   */
  if (sourceofcash === "Department") {
    if (
      !department ||
      !VALID_DEPARTMENTS.includes(
        department,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Select a valid department.",
        },
        { status: 400 },
      );
    }
  }

  /*
   * Generate the transaction reference.
   */
  const { data: existing } =
    await supabase
      .from("cashinflowreceivables")
      .select("transactionid");

  const id = nextPrefixedId(
    (existing ?? []).map(
      (row) => row.transactionid,
    ),
    "INF",
    9,
  );

  const { error } = await supabase
    .from("cashinflowreceivables")
    .insert({
      transactionid: id,

      sourceofcash,

      clientid:
        sourceofcash === "Client"
          ? clientid
          : null,

      projectid:
        sourceofcash === "Client"
          ? projectid
          : null,

      department:
        sourceofcash === "Department"
          ? department
          : null,

      amount,

      transactiondate:
        transactionDate,

      paymentmethod:
        paymentMethod,

      description,

      makeruserid:
        viewer.userId,

      approvalstatus:
        "Pending",
    });

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
      },
      { status: 400 },
    );
  }

  const { error: auditError } =
    await supabase
      .from("makercheckerauditlog")
      .insert({
        logid: `LOG${Date.now()
          .toString()
          .slice(-9)}`,

        transactiontype:
          "Cash Inflow",

        transactionid: id,

        actiontype: "Created",

        actionbyuserid:
          viewer.userId,

        actiondate: today,

        actiontime: new Date()
          .toTimeString()
          .slice(0, 8),
      });

  if (auditError) {
    console.error(
      "Cash inflow audit log failed:",
      auditError,
    );
  }

  return NextResponse.json(
    {
      transactionid: id,
    },
    { status: 201 },
  );
}