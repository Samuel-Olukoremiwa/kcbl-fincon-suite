import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/viewer";

/**
 * Direct staff account creation is intentionally disabled.
 *
 * New personnel must first be created in the Staff Database, submitted and
 * verified. A FinCon Suite login can then be created from that verified
 * onboarding record so identity details are reused instead of entered twice.
 */
export async function POST() {
  await requireStaff();

  return NextResponse.json(
    {
      error:
        "Direct staff-user creation is disabled. Onboard the staff member first, verify the personnel record, then use Create User Account from the verified onboarding record.",
    },
    { status: 409 },
  );
}
