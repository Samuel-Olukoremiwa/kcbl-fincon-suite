import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/viewer";
import { canEditStaffOnboarding } from "@/lib/staff-records";

export async function POST(request: Request) {
  const viewer = await requireStaff();

  if (!canEditStaffOnboarding(viewer)) {
    return NextResponse.json(
      { error: "You are not authorized to onboard staff." },
      { status: 403 },
    );
  }

  const body = await request.json();

  const fullname = String(body.fullname ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const phonenumber = String(body.phonenumber ?? "").trim();

  if (!fullname || !email || !phonenumber) {
    return NextResponse.json(
      { error: "Full name, email address and phone number are required." },
      { status: 400 },
    );
  }

  if (!email.includes("@")) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const [existingUserResult, existingOnboardingResult] = await Promise.all([
    admin
      .from("users")
      .select("userid,fullname,email")
      .ilike("email", email)
      .limit(1)
      .maybeSingle(),

    admin
      .from("staffonboarding")
      .select("onboardingid,fullname,onboardingstatus,createduserid")
      .ilike("email", email)
      .limit(1)
      .maybeSingle(),
  ]);

  if (existingUserResult.data) {
    return NextResponse.json(
      {
        error: `A system user already exists for ${email}. Open the existing staff record instead.`,
      },
      { status: 409 },
    );
  }

  if (existingOnboardingResult.data) {
    return NextResponse.json(
      {
        error: "A staff onboarding record already exists for this email address.",
        onboardingid: existingOnboardingResult.data.onboardingid,
      },
      { status: 409 },
    );
  }

  const { data, error } = await admin
    .from("staffonboarding")
    .insert({
      fullname,
      email,
      phonenumber,
      onboardingstatus: "Draft",
      employmentstatus: "Active",
      createdbyuserid: viewer.userId,
      updatedbyuserid: viewer.userId,
    })
    .select("onboardingid")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Could not start staff onboarding." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      onboardingid: data.onboardingid,
    },
    { status: 201 },
  );
}
