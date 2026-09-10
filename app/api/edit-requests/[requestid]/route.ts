import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/viewer";

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

export async function PATCH(request: Request, { params }: { params: { requestid: string } }) {
  const viewer = await requireStaff();
  if (!["Authorizer", "Super User"].includes(viewer.roleName)) {
    return NextResponse.json({ error: "Only an Authorizer or Super User can decide on edit requests." }, { status: 403 });
  }

  const { status, comments } = await request.json();
  if (!["Approved", "Rejected"].includes(status)) {
    return NextResponse.json({ error: "Status must be Approved or Rejected." }, { status: 400 });
  }
  if (status === "Rejected" && !comments) {
    return NextResponse.json({ error: "A rejection reason is required." }, { status: 400 });
  }

  const supabase = createClient();
  const admin = createAdminClient();

  const { data: editRequest, error: fetchError } = await supabase
    .from("recordeditrequests")
    .select("*")
    .eq("requestid", params.requestid)
    .single();
  if (fetchError || !editRequest) {
    return NextResponse.json({ error: "Edit request not found." }, { status: 404 });
  }
  if (editRequest.status !== "Pending") {
    return NextResponse.json({ error: "This request has already been decided." }, { status: 400 });
  }
  if (editRequest.requestedbyuserid === viewer.userId) {
    return NextResponse.json({ error: "You cannot decide on your own request." }, { status: 400 });
  }

  if (status === "Approved") {
    const table = TABLE_NAME[editRequest.entitytype];
    const idColumn = ID_COLUMN[editRequest.entitytype];
    const { error: applyError } = await admin
      .from(table)
      .update(editRequest.changes)
      .eq(idColumn, editRequest.entityid);
    if (applyError) {
      return NextResponse.json({ error: `Approved, but failed to apply: ${applyError.message}` }, { status: 500 });
    }
  }

  const { error } = await admin
    .from("recordeditrequests")
    .update({
      status,
      reviewedbyuserid: viewer.userId,
      reviewcomments: comments || null,
      reviewedat: new Date().toISOString(),
    })
    .eq("requestid", params.requestid);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}