import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      {
        error:
          "You must be signed in to change your password.",
      },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const password = String(
    body.password ?? "",
  );

  if (password.length < 8) {
    return NextResponse.json(
      {
        error:
          "Password must be at least 8 characters.",
      },
      { status: 400 },
    );
  }

  if (
    !/[0-9]/.test(password) ||
    !/[^a-zA-Z0-9]/.test(password)
  ) {
    return NextResponse.json(
      {
        error:
          "Password must include at least one number and one special character.",
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const {
    data: profile,
    error: profileError,
  } = await admin
    .from("users")
    .select("userid")
    .eq("authuserid", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json(
      { error: profileError.message },
      { status: 400 },
    );
  }

  if (!profile) {
    return NextResponse.json(
      {
        error:
          "Your FinCon Suite user profile could not be found.",
      },
      { status: 404 },
    );
  }

  const {
    error: passwordError,
  } = await admin.auth.admin.updateUserById(
    user.id,
    { password },
  );

  if (passwordError) {
    return NextResponse.json(
      { error: passwordError.message },
      { status: 400 },
    );
  }

  const { error: updateError } = await admin
    .from("users")
    .update({ mustchangepassword: false })
    .eq("userid", profile.userid)
    .eq("authuserid", user.id);

  if (updateError) {
    return NextResponse.json(
      {
        error:
          "Your password was changed, but the first-login requirement could not be cleared. Please try again.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
