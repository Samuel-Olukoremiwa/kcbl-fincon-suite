import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/viewer";
import {
  STAFF_DOCUMENT_BUCKET,
  canVerifyStaffOnboarding,
  canViewSensitiveStaffData,
  canViewStaffRecord,
} from "@/lib/staff-records";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: {
      onboardingid: string;
      documentid: string;
    };
  },
) {
  const viewer = await requireStaff();

  if (!canViewStaffRecord(viewer)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const onboardingid = Number(params.onboardingid);
  const documentid = Number(params.documentid);

  if (
    !Number.isInteger(onboardingid) ||
    onboardingid <= 0 ||
    !Number.isInteger(documentid) ||
    documentid <= 0
  ) {
    return NextResponse.json({ error: "Invalid document request." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: document } = await admin
    .from("staffonboardingdocuments")
    .select("storagepath,documenttype")
    .eq("documentid", documentid)
    .eq("onboardingid", onboardingid)
    .maybeSingle();

  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  if (
    document.documenttype === "Medical Result" &&
    !canViewSensitiveStaffData(viewer)
  ) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const { data, error } = await admin.storage
    .from(STAFF_DOCUMENT_BUCKET)
    .createSignedUrl(document.storagepath, 60);

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Could not open the document." },
      { status: 500 },
    );
  }

  return NextResponse.redirect(data.signedUrl);
}

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: {
      onboardingid: string;
      documentid: string;
    };
  },
) {
  const viewer = await requireStaff();

  if (!canVerifyStaffOnboarding(viewer)) {
    return NextResponse.json(
      { error: "Only an MD Office Authorizer or Super User may verify documents." },
      { status: 403 },
    );
  }

  const onboardingid = Number(params.onboardingid);
  const documentid = Number(params.documentid);

  if (
    !Number.isInteger(onboardingid) ||
    onboardingid <= 0 ||
    !Number.isInteger(documentid) ||
    documentid <= 0
  ) {
    return NextResponse.json({ error: "Invalid document request." }, { status: 400 });
  }

  const { verified, remarks } = await request.json();
  const admin = createAdminClient();

  const { data: onboarding } = await admin
    .from("staffonboarding")
    .select("onboardingstatus")
    .eq("onboardingid", onboardingid)
    .maybeSingle();

  if (!onboarding) {
    return NextResponse.json({ error: "Staff onboarding record not found." }, { status: 404 });
  }

  if (onboarding.onboardingstatus === "Account Created") {
    return NextResponse.json(
      { error: "Document verification is now managed from the linked Staff Record." },
      { status: 409 },
    );
  }

  const { error } = await admin
    .from("staffonboardingdocuments")
    .update({
      verified: Boolean(verified),
      verifiedbyuserid: verified ? viewer.userId : null,
      verifiedat: verified ? new Date().toISOString() : null,
      verificationremarks:
        typeof remarks === "string" && remarks.trim() ? remarks.trim() : null,
    })
    .eq("documentid", documentid)
    .eq("onboardingid", onboardingid);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
