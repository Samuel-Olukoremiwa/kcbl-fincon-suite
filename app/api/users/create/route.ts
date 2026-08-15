import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID_ROLES = ["Super Admin", "Maker", "Checker", "Client"];

export async function POST(request: Request) {
  const body = await request.json();
  const { fullName, email, phone, role, tempPassword } = body as {
    fullName?: string;
    email?: string;
    phone?: string;
    role?: string;
    tempPassword?: string;
  };

  if (!fullName || !email || !phone || !role || !tempPassword) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Not a valid role." }, { status: 400 });
  }
  if (tempPassword.length < 8) {
    return NextResponse.json(
      { error: "Temporary password must be at least 8 characters." },
      { status: 400 }
    );
  }

  // ------------------------------------------------------------------
  // 1. Confirm the CALLER is a real, logged-in Super Admin.
  //    This uses the caller's own session (cookie-based client), so it
  //    is itself subject to RLS — "Users can view own record" is what
  //    allows this SELECT to succeed at all.
  // ------------------------------------------------------------------
  const supabase = createClient();
  const { data: { user: caller } } = await supabase.auth.getUser();

  if (!caller) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: callerProfile } = await supabase
    .from("users")
    .select("userid, roles(rolename)")
    .eq("authuserid", caller.id)
    .single();

  const callerRole = (callerProfile?.roles as unknown as { rolename: string } | null)?.rolename;

  if (callerRole !== "Super Admin") {
    return NextResponse.json(
      { error: "Only a Super Admin can create users." },
      { status: 403 }
    );
  }

  // ------------------------------------------------------------------
  // From here on we use the ADMIN client (service role key), because
  // creating a new Supabase Auth account requires admin privileges that
  // no regular authenticated session has — this is not something RLS
  // can grant. The Super Admin check above is what makes this safe.
  // ------------------------------------------------------------------
  const admin = createAdminClient();

  // 2. Work out the next UserID (USR00001, USR00002, ...).
  const { data: lastUser } = await admin
    .from("users")
    .select("userid")
    .order("userid", { ascending: false })
    .limit(1)
    .single();

  const lastNumber = lastUser ? parseInt(lastUser.userid.replace("USR", ""), 10) : 0;
  const newUserId = `USR${String(lastNumber + 1).padStart(5, "0")}`;

  // 3. Look up the RoleID for the chosen role name.
  const { data: roleRow, error: roleError } = await admin
    .from("roles")
    .select("roleid")
    .eq("rolename", role)
    .single();

  if (roleError || !roleRow) {
    console.error("Role lookup failed:", roleError);
    return NextResponse.json(
      {
        error:
          roleError?.message ??
          "Could not resolve the selected role. Check that SUPABASE_SERVICE_ROLE_KEY in .env.local is set correctly and that you restarted `npm run dev` after editing it.",
      },
      { status: 500 }
    );
  }

  // 4. Create the real Supabase Auth account.
  const { data: newAuthUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });

  if (authError || !newAuthUser?.user) {
    console.error("Auth user creation failed:", authError);
    return NextResponse.json(
      { error: authError?.message ?? "Could not create the login account." },
      { status: 400 }
    );
  }

  // 5. Insert the matching row in public.Users.
  const { error: insertError } = await admin.from("users").insert({
    userid: newUserId,
    fullname: fullName,
    usertype: role === "Client" ? "Client" : "Staff",
    email,
    phonenumber: phone,
    roleid: roleRow.roleid,
    passwordhash: "SUPABASE_AUTH_MANAGED",
    status: "Active",
    datecreated: new Date().toISOString().slice(0, 10),
    createdby: callerProfile!.userid,
    authuserid: newAuthUser.user.id,
  });

  if (insertError) {
    console.error("Users row insert failed:", insertError);
    // Roll back the Auth account so we don't leave an orphaned login
    // with no matching application record.
    await admin.auth.admin.deleteUser(newAuthUser.user.id);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ userId: newUserId }, { status: 201 });
}
