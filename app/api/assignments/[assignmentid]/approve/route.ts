import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  request: Request,
  { params }: { params: { assignmentid: string } },
) {
  const viewer = await getViewer();

  const canAuthorize =
    viewer.roleName === "Super User" ||
    (viewer.department === "MD Office" &&
      ["Authorizer", "MD Office"].includes(viewer.roleName));

  if (!canAuthorize) {
    return NextResponse.json(
      {
        error:
          "Only an MD Office Authorizer or Super User may authorize project assignments.",
      },
      { status: 403 },
    );
  }

  const { decision } = await request.json();

  if (!["Approved", "Rejected"].includes(decision)) {
    return NextResponse.json(
      { error: "Choose Approved or Rejected." },
      { status: 400 },
    );
  }

  const { error } = await createAdminClient()
    .from("projectassignments")
    .update({
      approvalstatus: decision,
      authorizedbyuserid: viewer.userId,
      authorizedat: new Date().toISOString(),
      active: decision === "Approved",
    })
    .eq("assignmentid", params.assignmentid)
    .eq("approvalstatus", "Pending");

  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json({ ok: true });
}