import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/viewer";

const EDITABLE_FIELDS: Record<string, string[]> = {
  user: ["roleid", "department", "accesslevel"],
  client: ["email", "address", "idtype", "idnumber", "issuingauthority", "idexpirydate"],
  supplier: ["phonenumber", "email", "address"],
  subcontractor: ["phonenumber", "email", "address"],
};

const TABLE_NAME: Record<string, string> = {
  user: "users",
  client: "clients",
  supplier: "suppliers",
  subcontractor: "subcontractors",
};

const ID_COLUMN: Record<string, string> = {
  user: "userid",
  client: "clientid",
  supplier: "supplierid",
  subcontractor: "subcontractorid",
};

export async function GET(request: Request) {
  await requireStaff();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "Pending";

  const supabase = createClient();
  const { data, error } = await supabase
    .from("recordeditrequests")
    .select("*")
    .eq("status", status)
    .order("requestedat", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ requests: data });
}

export async function POST(request: Request) {
  const viewer = await requireStaff();
  const { entitytype, entityid, changes } = await request.json();

  if (!EDITABLE_FIELDS[entitytype]) {
    return NextResponse.json({ error: "Unknown record type." }, { status: 400 });
  }
  const allowed = EDITABLE_FIELDS[entitytype];
  const submittedFields = Object.keys(changes ?? {});
  const invalid = submittedFields.filter((f) => !allowed.includes(f));
  if (invalid.length) {
    return NextResponse.json({ error: `These fields cannot be edited this way: ${invalid.join(", ")}` }, { status: 400 });
  }
  if (!submittedFields.length) {
    return NextResponse.json({ error: "No changes provided." }, { status: 400 });
  }

  const supabase = createClient();
  const table = TABLE_NAME[entitytype];
  const idColumn = ID_COLUMN[entitytype];

  const { data: current, error: fetchError } = await supabase
    .from(table)
    .select(allowed.join(","))
    .eq(idColumn, entityid)
    .single();
  if (fetchError || !current) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  const { error } = await supabase.from("recordeditrequests").insert({
    entitytype,
    entityid,
    changes,
    previousvalues: current,
    requestedbyuserid: viewer.userId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true }, { status: 201 });
}