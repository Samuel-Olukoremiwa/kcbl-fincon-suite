import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/viewer";
import {
  SUPER_USER_ROLE,
  deriveAccessLevel,
  isAssignableStaffRole,
  isStaffDepartment,
} from "@/lib/roles";

export async function PATCH(request: Request) {
  const viewer = await requireStaff();

  if (viewer.roleName !== SUPER_USER_ROLE) {
    return NextResponse.json(
      {
        error:
          "Only a Super User can update staff roles and departmental access.",
      },
      { status: 403 },
    );
  }

  const { userid, roleid, department } = await request.json();

  if (!userid || !roleid || !department) {
    return NextResponse.json(
      { error: "userid, roleid, and department are required." },
      { status: 400 },
    );
  }

  if (!isStaffDepartment(String(department))) {
    return NextResponse.json(
      { error: "Select a valid staff department." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const [{ data: targetUser }, { data: roleRow }] = await Promise.all([
    admin
      .from("users")
      .select("userid,usertype")
      .eq("userid", userid)
      .maybeSingle(),

    admin
      .from("roles")
      .select("roleid,rolename")
      .eq("roleid", roleid)
      .maybeSingle(),
  ]);

  if (!targetUser) {
    return NextResponse.json(
      { error: "User account not found." },
      { status: 404 },
    );
  }

  if (targetUser.usertype === "Client") {
    return NextResponse.json(
      {
        error:
          "Client accounts are managed through Clients & KYC and cannot be converted into staff accounts here.",
      },
      { status: 400 },
    );
  }

  if (!roleRow || !isAssignableStaffRole(roleRow.rolename)) {
    return NextResponse.json(
      {
        error:
          "Staff roles can only be Initiator, Authorizer, or Super User.",
      },
      { status: 400 },
    );
  }

  // This route itself is Super User-only, so both assigning and removing the
  // Super User role are protected server-side.
  const accessLevel = deriveAccessLevel({
    userType: "Staff",
    roleName: roleRow.rolename,
  });

  const { error } = await admin
    .from("users")
    .update({
      roleid: roleRow.roleid,
      department: String(department).trim(),
      accesslevel: accessLevel,
    })
    .eq("userid", userid);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}