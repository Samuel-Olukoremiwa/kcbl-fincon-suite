import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/viewer";

const VALID_ACCESS_LEVELS = ["Read & Write", "Read Only"];

export async function PATCH(request: Request) {
  const viewer = await requireStaff();
  if (viewer.roleName !== "Super User") {
    return NextResponse.json({ error: "Only the Super User can update user roles and access." }, { status: 403 });
  }

  const { userid, roleid, department, accesslevel } = await request.json();
  if (!userid || !roleid) {
    return NextResponse.json({ error: "userid and roleid are required." }, { status: 400 });
  }
  if (accesslevel && !VALID_ACCESS_LEVELS.includes(accesslevel)) {
    return NextResponse.json({ error: "Invalid access level." }, { status: 400 });
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("users")
    .update({ roleid, department: department?.trim() || null, accesslevel: accesslevel ?? "Read Only" })
    .eq("userid", userid);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}