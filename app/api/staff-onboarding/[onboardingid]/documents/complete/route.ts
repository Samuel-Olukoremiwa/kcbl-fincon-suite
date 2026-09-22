import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/viewer";
import {
  MAX_STAFF_DOCUMENT_BYTES,
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
      { error: "You are not authorized to save staff onboarding documents." },
      { status: 403 },
    );
  }

  const onboardingid = Number(params.onboardingid);

  if (!Number.isInteger(onboardingid) || onboardingid <= 0) {
    return NextResponse.json({ error: "Invalid onboarding record." }, { status: 400 });
  }

  const { documenttype, filename, filesize, mimetype, storagepath } =
    await request.json();

  if (
    !(STAFF_DOCUMENT_TYPES as readonly string[]).includes(documenttype) ||
    typeof filename !== "string" ||
    !(STAFF_DOCUMENT_MIME_TYPES as readonly string[]).includes(mimetype) ||
    !Number.isInteger(filesize) ||
    filesize < 1 ||
    filesize > MAX_STAFF_DOCUMENT_BYTES ||
    typeof storagepath !== "string" ||
    !storagepath.startsWith(`onboarding/${onboardingid}/`)
  ) {
    return NextResponse.json({ error: "Invalid staff document details." }, { status: 400 });
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

  const { data, error } = await admin
    .from("staffonboardingdocuments")
    .insert({
      onboardingid,
      documenttype,
      filename: filename.trim(),
      storagepath,
      mimetype,
      filesize,
      uploadedbyuserid: viewer.userId,
    })
    .select("documentid")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Could not save the uploaded document." },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      documentid: data.documentid,
    },
    { status: 201 },
  );
}
