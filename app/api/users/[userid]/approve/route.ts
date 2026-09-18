import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  _request: Request,
  { params }: { params: { userid: string } },
) {
  const viewer = await getViewer();
  if (viewer.department !== "MD Office" && viewer.roleName !== "Super User")
    return NextResponse.json(
      { error: "Only MD Office may approve staff-user requests." },
      { status: 403 },
    );
  const { error } = await createAdminClient()
    .from("users")
    .update({ status: "Active" })
    .eq("userid", params.userid)
    .eq("status", "Pending");
  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json({ ok: true });
}
