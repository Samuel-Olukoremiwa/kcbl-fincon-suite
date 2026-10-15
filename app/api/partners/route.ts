import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireApiWriteAccess } from "@/lib/viewer";
import { nextPrefixedId } from "@/lib/client-utils";

type PartnerKind = "supplier" | "subcontractor";

function isPartnerKind(value: unknown): value is PartnerKind {
  return value === "supplier" || value === "subcontractor";
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeSpecialties(value: unknown) {
  const raw = Array.isArray(value) ? value : value ? [value] : [];

  return Array.from(
    new Set(
      raw
        .map((item) => normalizeText(item))
        .filter(Boolean),
    ),
  );
}

function moduleForKind(kind: PartnerKind) {
  return kind === "supplier" ? "suppliers" : "subcontractors";
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  if (!isPartnerKind(body.kind)) {
    return NextResponse.json(
      { error: "Select a valid partner type." },
      { status: 400 },
    );
  }

  const kind = body.kind;

  const { viewer, forbidden } =
    await requireApiWriteAccess(moduleForKind(kind));

  if (forbidden || !viewer) {
    return NextResponse.json(
      { error: `Not authorized to create ${kind}s.` },
      { status: 403 },
    );
  }

  if (viewer.roleName === "Authorizer") {
    return NextResponse.json(
      { error: `Authorizers cannot create new ${kind}s.` },
      { status: 403 },
    );
  }

  const name = normalizeText(body.name);
  const phone = normalizeText(body.phone);
  const address = normalizeText(body.address);
  const accountName = normalizeText(body.accountName);
  const accountNumber = normalizeText(body.accountNumber);
  const bank = normalizeText(body.bank);
  const status = normalizeText(body.status) || "Active";
  const specialties = normalizeSpecialties(
    body.specialties ?? body.specialty,
  );

  if (!name) {
    return NextResponse.json(
      { error: `Enter the ${kind} name.` },
      { status: 400 },
    );
  }

  if (!specialties.length) {
    return NextResponse.json(
      {
        error:
          kind === "supplier"
            ? "Select at least one supply category."
            : "Select at least one trade specialty.",
      },
      { status: 400 },
    );
  }

  if (!phone || !address || !accountName || !accountNumber || !bank) {
    return NextResponse.json(
      {
        error:
          "Phone number, address, account name, account number, and bank name are required.",
      },
      { status: 400 },
    );
  }

  if (!["Active", "Inactive"].includes(status)) {
    return NextResponse.json(
      { error: "Select a valid status." },
      { status: 400 },
    );
  }

  const supabase = createClient();

  const table =
    kind === "supplier" ? "suppliers" : "subcontractors";

  const idColumn =
    kind === "supplier" ? "supplierid" : "subcontractorid";

  const { data: existing, error: existingError } =
    await supabase.from(table).select(idColumn);

  if (existingError) {
    return NextResponse.json(
      { error: "Could not generate the partner code." },
      { status: 400 },
    );
  }

  const id = nextPrefixedId(
    (existing ?? []).map((row: any) => row[idColumn]),
    kind === "supplier" ? "SUP" : "SUB",
    5,
  );

  const base = {
    contactperson: normalizeText(body.contact) || null,
    phonenumber: phone,
    email: normalizeText(body.email) || null,
    address,
    description: normalizeText(body.description) || null,
    bankaccountname: accountName,
    bankaccountnumber: accountNumber,
    bankname: bank,
    status,
    datecreated: new Date().toISOString().slice(0, 10),
  };

  const { error } =
    kind === "supplier"
      ? await supabase.from("suppliers").insert({
          supplierid: id,
          suppliername: name,
          supplycategory: specialties,
          ...base,
        })
      : await supabase.from("subcontractors").insert({
          subcontractorid: id,
          subcontractorname: name,
          tradespecialty: specialties,
          ...base,
        });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 },
    );
  }

  const { error: auditError } = await supabase
    .from("makercheckerauditlog")
    .insert({
      logid: `LOG${Date.now().toString().slice(-9)}`,
      transactiontype: kind === "supplier" ? "Supplier" : "Subcontractor",
      transactionid: id,
      actiontype: "Created",
      actionbyuserid: viewer.userId,
      actiondate: new Date().toISOString().slice(0, 10),
      actiontime: new Date().toTimeString().slice(0, 8),
      comments: `${name} · ${specialties.join(", ")}`,
    });

  if (auditError) {
    console.error("Partner creation audit log failed:", auditError);
  }

  return NextResponse.json({ id }, { status: 201 });
}

export async function DELETE(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  if (!isPartnerKind(body.kind)) {
    return NextResponse.json(
      { error: "Select a valid partner type." },
      { status: 400 },
    );
  }

  const kind = body.kind;
  const id = normalizeText(body.id);

  if (!id) {
    return NextResponse.json(
      { error: "Partner ID is required." },
      { status: 400 },
    );
  }

  const { viewer, forbidden } =
    await requireApiWriteAccess(moduleForKind(kind));

  if (forbidden || !viewer) {
    return NextResponse.json(
      { error: "Not authorized to delete this record." },
      { status: 403 },
    );
  }

  if (viewer.roleName !== "Super User") {
    return NextResponse.json(
      {
        error:
          "Only a Super User can permanently delete suppliers or subcontractors.",
      },
      { status: 403 },
    );
  }

  const admin = createAdminClient();

  const table =
    kind === "supplier" ? "suppliers" : "subcontractors";

  const idColumn =
    kind === "supplier" ? "supplierid" : "subcontractorid";

  const nameColumn =
    kind === "supplier" ? "suppliername" : "subcontractorname";

  const { data: partner, error: partnerError } = await admin
    .from(table)
    .select(`${idColumn},${nameColumn}`)
    .eq(idColumn, id)
    .maybeSingle();

  if (partnerError) {
    return NextResponse.json(
      { error: partnerError.message },
      { status: 400 },
    );
  }

  if (!partner) {
    return NextResponse.json(
      {
        error:
          kind === "supplier"
            ? "Supplier not found."
            : "Subcontractor not found.",
      },
      { status: 404 },
    );
  }

  const transactionColumn =
    kind === "supplier" ? "supplierid" : "subcontractorid";

  const [transactionResult, pendingEditResult] =
    await Promise.all([
      admin
        .from("cashoutflowexpenditure")
        .select("transactionid", {
          count: "exact",
          head: true,
        })
        .eq(transactionColumn, id),

      admin
        .from("recordeditrequests")
        .select("requestid", {
          count: "exact",
          head: true,
        })
        .eq("entitytype", kind)
        .eq("entityid", id)
        .eq("status", "Pending"),
    ]);

  const dependencyError =
    transactionResult.error || pendingEditResult.error;

  if (dependencyError) {
    return NextResponse.json(
      {
        error: `Could not verify linked records: ${dependencyError.message}`,
      },
      { status: 400 },
    );
  }

  const transactionCount = transactionResult.count ?? 0;
  const pendingEditCount = pendingEditResult.count ?? 0;

  if (transactionCount > 0 || pendingEditCount > 0) {
    const reasons: string[] = [];

    if (transactionCount > 0) {
      reasons.push(`${transactionCount} financial transaction(s)`);
    }

    if (pendingEditCount > 0) {
      reasons.push(`${pendingEditCount} pending update request(s)`);
    }

    return NextResponse.json(
      {
        error:
          `This ${kind === "supplier" ? "supplier" : "subcontractor"} cannot be permanently deleted because it has ${reasons.join(
            " and ",
          )}. Set the record to Inactive instead.`,
      },
      { status: 409 },
    );
  }

  const { error: deleteError } = await admin
    .from(table)
    .delete()
    .eq(idColumn, id);

  if (deleteError) {
    return NextResponse.json(
      { error: deleteError.message },
      { status: 400 },
    );
  }

  const partnerName = String(
    (partner as Record<string, unknown>)[nameColumn] ?? id,
  );

  const { error: auditError } = await admin
    .from("makercheckerauditlog")
    .insert({
      logid: `LOG${Date.now().toString().slice(-9)}`,
      transactiontype: kind === "supplier" ? "Supplier" : "Subcontractor",
      transactionid: id,
      actiontype: "Deleted",
      actionbyuserid: viewer.userId,
      actiondate: new Date().toISOString().slice(0, 10),
      actiontime: new Date().toTimeString().slice(0, 8),
      comments: `Permanently deleted ${partnerName}`,
    });

  if (auditError) {
    console.error("Partner deletion audit log failed:", auditError);
  }

  return NextResponse.json({ ok: true, id });
}
