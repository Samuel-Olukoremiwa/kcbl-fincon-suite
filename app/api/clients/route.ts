import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireApiWriteAccess } from "@/lib/viewer";
import { nextPrefixedId } from "@/lib/client-utils";

export async function POST(request: Request) {
  const { viewer, forbidden } = await requireApiWriteAccess("clients");
  if (forbidden || !viewer) {
    return NextResponse.json({ error: "Not authorized to create clients." }, { status: 403 });
  }
  if (viewer.roleName === "Authorizer") {
    return NextResponse.json({ error: "Authorizers cannot create new clients." }, { status: 403 });
  }

  const body = await request.json();
  const {
    type, name, phone, email, address,
    idType, idNumber, issuer, expiry,
    rcNumber, business, directorName, directorPosition, directorDate,
    ownerName, ownership, ownerContact,
    payment, source, supportingDoc,
    declaration, declarationDate, linkedUser,
    risk, riskComments,
  } = body;

  if (type === "Company" && !directorName) {
    return NextResponse.json({ error: "A Company needs at least one director or authorised signatory." }, { status: 400 });
  }

  const supabase = createClient();
  const { data: existing } = await supabase.from("clients").select("clientid");
  const clientid = nextPrefixedId((existing ?? []).map((x) => x.clientid), "CLI", 5);
  const ind = type === "Individual";
  const company = type === "Company";

  const { error: ce } = await supabase.from("clients").insert({
    clientid,
    clienttype: type,
    fullnameorcompanyname: name,
    address,
    phonenumber: phone,
    email,
    idtype: ind ? idType : null,
    idnumber: ind ? idNumber : null,
    issuingauthority: ind ? issuer : null,
    idexpirydate: ind ? (expiry || null) : null,
    rcnumber: company ? rcNumber : null,
    natureofbusiness: company ? business : null,
    preferredpaymentmethod: payment,
    declarationclientname: declaration,
    declarationdate: declarationDate,
    linkeduserid: linkedUser || null,
    createdby: viewer.userId,
  });
  if (ce) return NextResponse.json({ error: ce.message }, { status: 400 });

  const writes: PromiseLike<{ error: { message: string } | null }>[] = [];
  if (company) {
    writes.push(
      supabase.from("clientdirectors").insert({
        clientid, name: directorName, position: directorPosition, signaturedate: directorDate || null,
      })
    );
  }
  if (company && ownerName) {
    writes.push(
      supabase.from("clientbeneficialowners").insert({
        clientid, name: ownerName, ownershippct: Number(ownership), contact: ownerContact,
      })
    );
  }
  if (source) {
    writes.push(supabase.from("clientsourceoffunds").insert({ clientid, sourcetype: source, supportingdocumenttype: supportingDoc || null }));
  }
  if (risk) {
    writes.push(
      supabase.from("clientriskassessment").insert({
        clientid, riskcategory: risk, comments: riskComments || null,
        verifiedbyuserid: viewer.userId, verificationdate: new Date().toISOString().slice(0, 10),
      })
    );
  }

  const rs = await Promise.all(writes);
  const fail = rs.find((x) => x.error);
  if (fail?.error) {
    return NextResponse.json({ clientid, error: `Client created, but a related KYC item failed: ${fail.error.message}` }, { status: 207 });
  }

  return NextResponse.json({ clientid });
}