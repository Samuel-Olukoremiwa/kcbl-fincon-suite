import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const VALID_ROLES = [
  "Initiator",
  "Authorizer",
  "MD",
  "MD Office",
  "Executive Director",
  "Non-Executive Director",
  "Finance & Admin",
  "Business Development",
  "Operations",
  "Internal Control",
];

export async function POST(request: Request) {
  const body = await request.json();

  const {
    fullName,
    email,
    phone,
    role,
    department,
    accessLevel,
    projectid,
  } = body as {
    fullName?: string;
    email?: string;
    phone?: string;
    role?: string;
    department?: string;
    accessLevel?: "Read & Write" | "Read Only";
    projectid?: string;
  };

  if (!fullName || !email || !phone || !role || !department) {
    return NextResponse.json(
      { error: "Full name, email, phone number, role, and department are required." },
      { status: 400 }
    );
  }

  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json(
      { error: "Select a valid staff role." },
      { status: 400 }
    );
  }

  if (!["Read & Write", "Read Only"].includes(accessLevel ?? "")) {
    return NextResponse.json(
      { error: "Select a valid access level." },
      { status: 400 }
    );
  }

  if (department === "Operations" && !projectid) {
    return NextResponse.json(
      { error: "Operations staff must be assigned to a project code." },
      { status: 400 }
    );
  }

  const supabase = createClient();

  const {
    data: { user: caller },
  } = await supabase.auth.getUser();

  if (!caller) {
    return NextResponse.json(
      { error: "You are not signed in." },
      { status: 401 }
    );
  }

  const { data: callerProfile } = await supabase
    .from("users")
    .select("userid, department, roles(rolename)")
    .eq("authuserid", caller.id)
    .single();

  if (!callerProfile) {
    return NextResponse.json(
      { error: "Your staff profile could not be found." },
      { status: 403 }
    );
  }

  const callerRole =
    (
      callerProfile.roles as unknown as
        | { rolename: string }
        | null
    )?.rolename ?? "";

  const callerCanCreate =
    callerRole === "Super User" ||
    callerProfile.department === "Business Development";

  if (!callerCanCreate) {
    return NextResponse.json(
      {
        error:
          "Only Business Development or a Super User can submit staff-user requests.",
      },
      { status: 403 }
    );
  }

  const admin = createAdminClient();

  if (department === "Operations") {
    const { data: project } = await admin
      .from("projects")
      .select("projectid")
      .eq("projectid", projectid!)
      .maybeSingle();

    if (!project) {
      return NextResponse.json(
        { error: "The selected project code does not exist." },
        { status: 400 }
      );
    }
  }

  const { data: roleRow, error: roleError } = await admin
    .from("roles")
    .select("roleid")
    .eq("rolename", role)
    .single();

  if (roleError || !roleRow) {
    return NextResponse.json(
      {
        error:
          roleError?.message ??
          "Could not find the selected staff role.",
      },
      { status: 400 }
    );
  }

  const { data: lastUser } = await admin
    .from("users")
    .select("userid")
    .order("userid", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastNumber = lastUser
    ? Number.parseInt(lastUser.userid.replace("USR", ""), 10)
    : 0;

  const newUserId = `USR${String(lastNumber + 1).padStart(5, "0")}`;

  const temporaryPassword = `${crypto
    .randomUUID()
    .replace(/-/g, "")
    .slice(0, 10)}!A1`;

  const { data: newAuthUser, error: authError } =
    await admin.auth.admin.createUser({
      email: email.trim(),
      password: temporaryPassword,
      email_confirm: true,
    });

  if (authError || !newAuthUser?.user) {
    return NextResponse.json(
      {
        error:
          authError?.message ??
          "Could not create the secure sign-in account.",
      },
      { status: 400 }
    );
  }

  const { error: userError } = await admin.from("users").insert({
    userid: newUserId,
    fullname: fullName.trim(),
    usertype: "Staff",
    email: email.trim(),
    loginemail: email.trim(),
    phonenumber: phone.trim(),
    department,
    accesslevel: accessLevel,
    roleid: roleRow.roleid,
    passwordhash: "SUPABASE_AUTH_MANAGED",
    status: "Pending Approval",
    datecreated: new Date().toISOString().slice(0, 10),
    createdby: callerProfile.userid,
    authuserid: newAuthUser.user.id,
  });

  if (userError) {
    await admin.auth.admin.deleteUser(newAuthUser.user.id);

    return NextResponse.json(
      { error: userError.message },
      { status: 400 }
    );
  }

  if (department === "Operations") {
    const { error: assignmentError } = await admin
      .from("projectassignments")
      .insert({
        projectid,
        userid: newUserId,
        assignmentrole: "Operations Staff",
        assignedbyuserid: callerProfile.userid,
        approvalstatus: "Pending",
        active: false,
      });

    if (assignmentError) {
      return NextResponse.json(
        {
          error:
            "The staff request was created, but the project assignment request failed: " +
            assignmentError.message,
        },
        { status: 400 }
      );
    }
  }

  const mailer = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  await mailer.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${new URL(request.url).origin}/login/reset-password`,
  });

  return NextResponse.json(
    {
      userId: newUserId,
      temporaryPassword,
      message:
        "Staff-user request submitted. MD Office must approve it before the account can sign in.",
    },
    { status: 201 }
  );
}