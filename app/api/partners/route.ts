import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireApiWriteAccess } from "@/lib/viewer";
import { nextPrefixedId } from "@/lib/client-utils";

export async function POST(request: Request) {
  const body = await request.json();
  const kind: "supplier" | "subcontractor" = body.kind;
  const module = kind === "supplier" ? "suppliers" : "subcontractors";
  const { viewer, forbidden } = await requireApiWriteAccess(module);
  if (forbidden || !viewer) return NextResponse.json({ error: `Not authorized to create ${kind}s.` }, { status: 403 });
  if (viewer.roleName === "Authorizer") return NextResponse.json({ error: `Authorizers cannot create new ${kind}s.` }, { status: 403 });
  const supabase = createClient();
  const table = kind === "supplier" ? "suppliers" : "subcontractors";
  const idColumn = kind === "supplier" ? "supplierid" : "subcontractorid";
  const { data: existing } = await supabase.from(table).select(idColumn);
  const id = nextPrefixedId((existing ?? []).map((x: any) => x[idColumn]), kind === "supplier" ? "SUP" : "SUB", 5);
  const base = { contactperson: body.contact || null, phonenumber: body.phone, email: body.email || null, address: body.address, bankaccountname: body.accountName, bankaccountnumber: body.accountNumber, bankname: body.bank, status: body.status, datecreated: new Date().toISOString().slice(0, 10) };
  const { error } = kind === "supplier" ? await supabase.from("suppliers").insert({ supplierid: id, suppliername: body.name, supplycategory: body.specialty, ...base }) : await supabase.from("subcontractors").insert({ subcontractorid: id, subcontractorname: body.name, tradespecialty: body.specialty, ...base });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await supabase.from("makercheckerauditlog").insert({
    logid: `LOG${Date.now().toString().slice(-9)}`,
    transactiontype: kind === "supplier" ? "Supplier" : "Subcontractor", transactionid: id, actiontype: "Created",
    actionbyuserid: viewer.userId, actiondate: new Date().toISOString().slice(0, 10),
    actiontime: new Date().toTimeString().slice(0, 8), comments: body.name,
  });
  return NextResponse.json({ id });
}
