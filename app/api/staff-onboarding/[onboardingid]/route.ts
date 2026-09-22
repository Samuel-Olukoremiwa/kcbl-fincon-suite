import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/viewer";
import {
  canEditSensitiveStaffData,
  canEditStaffOnboarding,
  canVerifyStaffOnboarding,
  canViewStaffRecord,
} from "@/lib/staff-records";

const CORE_FIELDS = [
  "fullname",
  "email",
  "phonenumber",
  "dateofbirth",
  "gender",
  "nationality",
  "stateoforigin",
  "localgovernmentarea",
  "residentialaddress",
  "highestqualification",
  "institution",
  "courseofstudy",
  "yearobtained",
  "professionalcertifications",
  "relevantskills",
  "yearsofrelevantexperience",
  "mostrecentemployer",
  "previouspositionheld",
  "previousemploymentduration",
  "reasonforleaving",
  "previousprojectexperience",
  "emergencycontactname",
  "emergencyrelationship",
  "emergencyphone",
  "emergencyalternativephone",
  "emergencyaddress",
  "roletrade",
  "primaryareaofwork",
  "safetybootsize",
  "coverallsize",
  "reflectivevestsize",
  "helmetsize",
  "equipmentandotherskills",
  "declarationconfirmed",
  "declarationstaffname",
  "declarationdate",
] as const;

const SENSITIVE_FIELDS = [
  "bankname",
  "bankaccountname",
  "bankaccountnumber",
  "tin",
] as const;

const ADMIN_FIELDS = [
  "datereceived",
  "employmentletterissued",
  "staffidassigned",
  "ppeissued",
  "hseinductioncompleted",
  "stafffilecreated",
  "medicalresultgood",
  "adminremarks",
  "employmentstatus",
] as const;

const REFERENCE_FIELDS = [
  "fullname",
  "relationshipposition",
  "organisation",
  "address",
  "phone",
] as const;

function pickFields(source: Record<string, unknown>, allowed: readonly string[]) {
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => allowed.includes(key)),
  );
}

function hasAnyField(source: Record<string, unknown>, fields: readonly string[]) {
  return fields.some((field) => Object.prototype.hasOwnProperty.call(source, field));
}

function normalizeNullableString(value: unknown) {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeValues(values: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(values)) {
    if (
      [
        "declarationconfirmed",
        "employmentletterissued",
        "ppeissued",
        "hseinductioncompleted",
        "stafffilecreated",
        "medicalresultgood",
      ].includes(key)
    ) {
      normalized[key] = value === null ? null : Boolean(value);
      continue;
    }

    if (key === "yearobtained") {
      normalized[key] = value === "" || value === null ? null : Number(value);
      continue;
    }

    if (key === "yearsofrelevantexperience") {
      normalized[key] = value === "" || value === null ? null : Number(value);
      continue;
    }

    normalized[key] = normalizeNullableString(value);
  }

  return normalized;
}

export async function GET(
  _request: Request,
  { params }: { params: { onboardingid: string } },
) {
  const viewer = await requireStaff();

  if (!canViewStaffRecord(viewer)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const onboardingid = Number(params.onboardingid);

  if (!Number.isInteger(onboardingid) || onboardingid <= 0) {
    return NextResponse.json({ error: "Invalid onboarding record." }, { status: 400 });
  }

  const admin = createAdminClient();

  const [{ data: onboarding }, { data: references }, { data: documents }] =
    await Promise.all([
      admin
        .from("staffonboarding")
        .select("*")
        .eq("onboardingid", onboardingid)
        .maybeSingle(),
      admin
        .from("staffonboardingreferences")
        .select("*")
        .eq("onboardingid", onboardingid)
        .order("referencenumber"),
      admin
        .from("staffonboardingdocuments")
        .select(
          "documentid,onboardingid,documenttype,filename,mimetype,filesize,uploadedbyuserid,uploadedat,verified,verifiedbyuserid,verifiedat,verificationremarks",
        )
        .eq("onboardingid", onboardingid)
        .order("uploadedat", { ascending: false }),
    ]);

  if (!onboarding) {
    return NextResponse.json({ error: "Staff onboarding record not found." }, { status: 404 });
  }

  const visible = { ...onboarding } as Record<string, unknown>;

  if (!canEditSensitiveStaffData(viewer)) {
    delete visible.bankname;
    delete visible.bankaccountname;
    delete visible.bankaccountnumber;
    delete visible.tin;
    delete visible.medicalresultgood;
    delete visible.adminremarks;
  }

  return NextResponse.json({
    onboarding: visible,
    references: references ?? [],
    documents:
      canEditSensitiveStaffData(viewer)
        ? documents ?? []
        : (documents ?? []).filter((document) => document.documenttype !== "Medical Result"),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: { onboardingid: string } },
) {
  const viewer = await requireStaff();

  if (!canViewStaffRecord(viewer)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const onboardingid = Number(params.onboardingid);

  if (!Number.isInteger(onboardingid) || onboardingid <= 0) {
    return NextResponse.json({ error: "Invalid onboarding record." }, { status: 400 });
  }

  const body = await request.json();
  const action = String(body.action ?? "save");
  const profileInput =
    body.profile && typeof body.profile === "object" && !Array.isArray(body.profile)
      ? (body.profile as Record<string, unknown>)
      : {};
  const referencesInput = Array.isArray(body.references) ? body.references : [];

  if (!["save", "submit", "verify"].includes(action)) {
    return NextResponse.json({ error: "Invalid onboarding action." }, { status: 400 });
  }

  const canEditCore = canEditStaffOnboarding(viewer);
  const canEditSensitive = canEditSensitiveStaffData(viewer);
  const canVerify = canVerifyStaffOnboarding(viewer);

  if ((action === "save" || action === "submit") && !canEditCore) {
    return NextResponse.json(
      { error: "You are not authorized to edit staff onboarding records." },
      { status: 403 },
    );
  }

  if (action === "verify" && !canVerify) {
    return NextResponse.json(
      { error: "Only an MD Office Authorizer or Super User may verify onboarding." },
      { status: 403 },
    );
  }

  if (hasAnyField(profileInput, SENSITIVE_FIELDS) && !canEditSensitive) {
    return NextResponse.json(
      { error: "You are not authorized to edit bank/payroll information." },
      { status: 403 },
    );
  }

  if (hasAnyField(profileInput, ADMIN_FIELDS) && !canVerify) {
    return NextResponse.json(
      { error: "Only an MD Office Authorizer or Super User may edit admin verification fields." },
      { status: 403 },
    );
  }

  const admin = createAdminClient();

  const { data: current } = await admin
    .from("staffonboarding")
    .select("*")
    .eq("onboardingid", onboardingid)
    .maybeSingle();

  if (!current) {
    return NextResponse.json({ error: "Staff onboarding record not found." }, { status: 404 });
  }

  if (current.onboardingstatus === "Account Created") {
    return NextResponse.json(
      {
        error:
          "This onboarding record already has a system account. Continue future personnel updates from the linked Staff Record.",
      },
      { status: 409 },
    );
  }

  if (action === "verify" && current.onboardingstatus !== "Submitted") {
    return NextResponse.json(
      { error: "The onboarding record must be submitted before it can be verified." },
      { status: 400 },
    );
  }

  let updates: Record<string, unknown> = {};

  if (canEditCore) {
    updates = { ...updates, ...pickFields(profileInput, CORE_FIELDS) };
  }

  if (canEditSensitive) {
    updates = { ...updates, ...pickFields(profileInput, SENSITIVE_FIELDS) };
  }

  if (canVerify) {
    updates = { ...updates, ...pickFields(profileInput, ADMIN_FIELDS) };
  }

  updates = normalizeValues(updates);

  const merged = { ...current, ...updates } as Record<string, unknown>;

  if (action === "submit") {
    const fullname = String(merged.fullname ?? "").trim();
    const email = String(merged.email ?? "").trim();
    const phonenumber = String(merged.phonenumber ?? "").trim();
    const declarationName = String(merged.declarationstaffname ?? "").trim();
    const declarationDate = String(merged.declarationdate ?? "").trim();

    if (!fullname || !email || !phonenumber) {
      return NextResponse.json(
        { error: "Full name, email address and phone number are required before submission." },
        { status: 400 },
      );
    }

    if (!email.includes("@")) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    if (!merged.declarationconfirmed || !declarationName || !declarationDate) {
      return NextResponse.json(
        {
          error:
            "The staff declaration name, confirmation and declaration date are required before submission.",
        },
        { status: 400 },
      );
    }
  }

  if (Object.prototype.hasOwnProperty.call(updates, "email")) {
    const email = String(updates.email ?? "").trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const [{ data: otherOnboarding }, { data: existingUser }] = await Promise.all([
      admin
        .from("staffonboarding")
        .select("onboardingid")
        .ilike("email", email)
        .neq("onboardingid", onboardingid)
        .limit(1)
        .maybeSingle(),
      admin
        .from("users")
        .select("userid")
        .ilike("email", email)
        .limit(1)
        .maybeSingle(),
    ]);

    if (otherOnboarding || existingUser) {
      return NextResponse.json(
        { error: "Another staff/onboarding record already uses this email address." },
        { status: 409 },
      );
    }

    updates.email = email;
  }

  updates.updatedat = new Date().toISOString();
  updates.updatedbyuserid = viewer.userId;

  if (action === "submit") {
    updates.onboardingstatus = "Submitted";
    updates.onboardingsubmittedat = new Date().toISOString();
  }

  if (action === "verify") {
    updates.onboardingstatus = "Verified";
    updates.onboardingverifiedat = new Date().toISOString();
    updates.onboardingverifiedbyuserid = viewer.userId;
    updates.documentsverifiedbyuserid = viewer.userId;

    if (!merged.datereceived) {
      updates.datereceived = new Date().toISOString().slice(0, 10);
    }
  }

  const { error: updateError } = await admin
    .from("staffonboarding")
    .update(updates)
    .eq("onboardingid", onboardingid);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  if (canEditCore && referencesInput.length > 0) {
    for (const reference of referencesInput.slice(0, 2)) {
      const number = Number(reference?.referencenumber);

      if (![1, 2].includes(number)) continue;

      const clean = normalizeValues(
        pickFields(
          reference && typeof reference === "object"
            ? (reference as Record<string, unknown>)
            : {},
          REFERENCE_FIELDS,
        ),
      );

      const { error: referenceError } = await admin
        .from("staffonboardingreferences")
        .upsert(
          {
            onboardingid,
            referencenumber: number,
            ...clean,
            updatedat: new Date().toISOString(),
          },
          { onConflict: "onboardingid,referencenumber" },
        );

      if (referenceError) {
        return NextResponse.json({ error: referenceError.message }, { status: 400 });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    onboardingstatus:
      action === "submit"
        ? "Submitted"
        : action === "verify"
          ? "Verified"
          : current.onboardingstatus,
  });
}
