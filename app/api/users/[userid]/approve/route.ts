import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  _request: Request,
  { params }: { params: { userid: string } },
) {
  const viewer = await getViewer();

  const canApprove =
    viewer.roleName === "Super User" ||
    (viewer.department === "MD Office" &&
      ["Authorizer", "MD Office"].includes(viewer.roleName));

  if (!canApprove) {
    return NextResponse.json(
      {
        error:
          "Only an MD Office Authorizer or Super User may approve staff-user requests.",
      },
      { status: 403 },
    );
  }

  const { error } = await createAdminClient()
    .from("users")
    .update({ status: "Active" })
    .eq("userid", params.userid)
    .eq("usertype", "Staff")
    .eq("status", "Pending");

  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json({ ok: true });
}