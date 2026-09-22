import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/viewer";
import {
  MAX_STAFF_DOCUMENT_BYTES,
  STAFF_DOCUMENT_BUCKET,
  STAFF_DOCUMENT_MIME_TYPES,
  STAFF_DOCUMENT_TYPES,
  canEditStaffOnboarding,
} from "@/lib/staff-records";

export async function POST(
  request: Request,
  { params }: { params: { onboardingid: string } },
) {
  const viewer = await requireStaff();

  if (!canEditStaffOnboarding(viewer)) {
    return NextResponse.json(
      { error: "You are not authorized to upload staff onboarding documents." },
      { status: 403 },
    );
  }

  const onboardingid = Number(params.onboardingid);

  if (!Number.isInteger(onboardingid) || onboardingid <= 0) {
    return NextResponse.json({ error: "Invalid onboarding record." }, { status: 400 });
  }

  const { documenttype, filename, filesize, mimetype } = await request.json();

  if (
    !(STAFF_DOCUMENT_TYPES as readonly string[]).includes(documenttype) ||
    typeof filename !== "string" ||
    !(STAFF_DOCUMENT_MIME_TYPES as readonly string[]).includes(mimetype) ||
    !Number.isInteger(filesize) ||
    filesize < 1 ||
    filesize > MAX_STAFF_DOCUMENT_BYTES
  ) {
    return NextResponse.json(
      {
        error:
          "Choose a supported PDF/JPG/PNG document no larger than 20 MB and a valid document type.",
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: onboarding } = await admin
    .from("staffonboarding")
    .select("onboardingid,onboardingstatus")
    .eq("onboardingid", onboardingid)
    .maybeSingle();

  if (!onboarding) {
    return NextResponse.json({ error: "Staff onboarding record not found." }, { status: 404 });
  }

  if (onboarding.onboardingstatus === "Account Created") {
    return NextResponse.json(
      { error: "Use the linked Staff Record for new documents after account creation." },
      { status: 409 },
    );
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagepath = `onboarding/${onboardingid}/${crypto.randomUUID()}-${safeName}`;

  const { data, error } = await admin.storage
    .from(STAFF_DOCUMENT_BUCKET)
    .createSignedUploadUrl(storagepath);

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Could not prepare the document upload." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    storagepath,
    token: data.token,
  });
}
