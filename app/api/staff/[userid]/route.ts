import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/viewer";
import {
  canEditSensitiveStaffData,
  canEditStaffOnboarding,
  canVerifyStaffOnboarding,
  canViewStaffRecord,
} from "@/lib/staff-records";

const CORE_PROFILE_FIELDS = [
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

const SENSITIVE_PROFILE_FIELDS = [
  "bankname",
  "bankaccountname",
  "bankaccountnumber",
  "tin",
] as const;

const ADMIN_PROFILE_FIELDS = [
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

function pickFields(
  source: Record<string, unknown>,
  allowed: readonly string[],
) {
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => allowed.includes(key)),
  );
}

function hasAnyField(
  source: Record<string, unknown>,
  fields: readonly string[],
) {
  return fields.some((field) =>
    Object.prototype.hasOwnProperty.call(source, field),
  );
}

function normalizeNullableString(value: unknown) {
  if (typeof value !== "string") return value ?? null;

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function normalizeProfileValues(values: Record<string, unknown>) {
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
      normalized[key] =
        value === "" || value === null
          ? null
          : Number(value);

      continue;
    }

    if (key === "yearsofrelevantexperience") {
      normalized[key] =
        value === "" || value === null
          ? null
          : Number(value);

      continue;
    }

    normalized[key] = normalizeNullableString(value);
  }

  return normalized;
}

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: {
      userid: string;
    };
  },
) {
  const viewer = await requireStaff();

  if (!canViewStaffRecord(viewer)) {
    return NextResponse.json(
      {
        error: "Not authorized.",
      },
      {
        status: 403,
      },
    );
  }

  const admin = createAdminClient();

  const {
    data: user,
  } = await admin
    .from("users")
    .select(
      "userid,fullname,email,phonenumber,department,status,usertype,roleid,roles(rolename)",
    )
    .eq(
      "userid",
      params.userid,
    )
    .eq(
      "usertype",
      "Staff",
    )
    .maybeSingle();

  if (!user) {
    return NextResponse.json(
      {
        error:
          "Staff member not found.",
      },
      {
        status: 404,
      },
    );
  }

  const [
    {
      data: profile,
    },
    {
      data: references,
    },
    {
      data: documents,
    },
  ] = await Promise.all([
    admin
      .from("staffprofiles")
      .select("*")
      .eq(
        "userid",
        params.userid,
      )
      .maybeSingle(),

    admin
      .from("staffreferences")
      .select("*")
      .eq(
        "userid",
        params.userid,
      )
      .order("referencenumber"),

    admin
      .from("staffdocuments")
      .select(
        "documentid,userid,documenttype,filename,mimetype,filesize,uploadedbyuserid,uploadedat,verified,verifiedbyuserid,verifiedat,verificationremarks",
      )
      .eq(
        "userid",
        params.userid,
      )
      .order(
        "uploadedat",
        {
          ascending: false,
        },
      ),
  ]);

  const visibleProfile = {
    ...(profile ?? {
      userid: params.userid,
    }),
  } as Record<
    string,
    unknown
  >;

  if (
    !canEditSensitiveStaffData(
      viewer,
    )
  ) {
    delete visibleProfile.bankname;
    delete visibleProfile.bankaccountname;
    delete visibleProfile.bankaccountnumber;
    delete visibleProfile.tin;
    delete visibleProfile.medicalresultgood;
    delete visibleProfile.adminremarks;
  }

  return NextResponse.json({
    user,

    profile:
      visibleProfile,

    references:
      references ?? [],

    documents:
      documents ?? [],

    permissions: {
      canEditCore:
        canEditStaffOnboarding(
          viewer,
        ),

      canEditSensitive:
        canEditSensitiveStaffData(
          viewer,
        ),

      canVerify:
        canVerifyStaffOnboarding(
          viewer,
        ),
    },
  });
}

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: {
      userid: string;
    };
  },
) {
  const viewer =
    await requireStaff();

  if (
    !canViewStaffRecord(
      viewer,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Not authorized.",
      },
      {
        status: 403,
      },
    );
  }

  const body =
    await request.json();

  const action =
    String(
      body.action ??
        "save",
    );

  const profileInput =
    body.profile &&
    typeof body.profile ===
      "object" &&
    !Array.isArray(
      body.profile,
    )
      ? (body.profile as Record<
          string,
          unknown
        >)
      : {};

  const referencesInput =
    Array.isArray(
      body.references,
    )
      ? body.references
      : [];

  if (
    ![
      "save",
      "submit",
      "verify",
    ].includes(action)
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid staff-record action.",
      },
      {
        status: 400,
      },
    );
  }

  const canEditCore =
    canEditStaffOnboarding(
      viewer,
    );

  const canEditSensitive =
    canEditSensitiveStaffData(
      viewer,
    );

  const canVerify =
    canVerifyStaffOnboarding(
      viewer,
    );

  if (
    (
      action ===
        "save" ||
      action ===
        "submit"
    ) &&
    !canEditCore
  ) {
    return NextResponse.json(
      {
        error:
          "You are not authorized to edit staff onboarding records.",
      },
      {
        status: 403,
      },
    );
  }

  if (
    action ===
      "verify" &&
    !canVerify
  ) {
    return NextResponse.json(
      {
        error:
          "Only an MD Office Authorizer or Super User may verify onboarding.",
      },
      {
        status: 403,
      },
    );
  }

  if (
    hasAnyField(
      profileInput,
      SENSITIVE_PROFILE_FIELDS,
    ) &&
    !canEditSensitive
  ) {
    return NextResponse.json(
      {
        error:
          "You are not authorized to edit bank/payroll information.",
      },
      {
        status: 403,
      },
    );
  }

  if (
    hasAnyField(
      profileInput,
      ADMIN_PROFILE_FIELDS,
    ) &&
    !canVerify
  ) {
    return NextResponse.json(
      {
        error:
          "Only an MD Office Authorizer or Super User may edit admin verification fields.",
      },
      {
        status: 403,
      },
    );
  }

  const admin =
    createAdminClient();

  const {
    data: targetUser,
  } = await admin
    .from("users")
    .select(
      "userid,fullname,usertype",
    )
    .eq(
      "userid",
      params.userid,
    )
    .eq(
      "usertype",
      "Staff",
    )
    .maybeSingle();

  if (!targetUser) {
    return NextResponse.json(
      {
        error:
          "Staff member not found.",
      },
      {
        status: 404,
      },
    );
  }

  const {
    data:
      currentProfile,
  } = await admin
    .from("staffprofiles")
    .select(
      "onboardingstatus",
    )
    .eq(
      "userid",
      params.userid,
    )
    .maybeSingle();

  if (
    action ===
    "submit"
  ) {
    const merged = {
      ...(currentProfile ??
        {}),
      ...profileInput,
    } as Record<
      string,
      unknown
    >;

    if (
      !merged.declarationconfirmed ||
      !String(
        merged.declarationstaffname ??
          "",
      ).trim() ||
      !String(
        merged.declarationdate ??
          "",
      ).trim()
    ) {
      return NextResponse.json(
        {
          error:
            "The staff declaration name, confirmation, and declaration date are required before submission.",
        },
        {
          status: 400,
        },
      );
    }
  }

  if (
    action ===
      "verify" &&
    currentProfile?.onboardingstatus !==
      "Submitted"
  ) {
    return NextResponse.json(
      {
        error:
          "The onboarding record must be submitted before it can be verified.",
      },
      {
        status: 400,
      },
    );
  }

  let updates:
    Record<
      string,
      unknown
    > = {};

  if (canEditCore) {
    updates = {
      ...updates,

      ...pickFields(
        profileInput,
        CORE_PROFILE_FIELDS,
      ),
    };
  }

  if (
    canEditSensitive
  ) {
    updates = {
      ...updates,

      ...pickFields(
        profileInput,
        SENSITIVE_PROFILE_FIELDS,
      ),
    };
  }

  if (canVerify) {
    updates = {
      ...updates,

      ...pickFields(
        profileInput,
        ADMIN_PROFILE_FIELDS,
      ),
    };
  }

  updates =
    normalizeProfileValues(
      updates,
    );

  updates.updatedat =
    new Date().toISOString();

  updates.updatedbyuserid =
    viewer.userId;

  if (
    action ===
    "submit"
  ) {
    updates.onboardingstatus =
      "Submitted";

    updates.onboardingsubmittedat =
      new Date().toISOString();
  }

  if (
    action ===
    "verify"
  ) {
    updates.onboardingstatus =
      "Verified";

    updates.onboardingverifiedat =
      new Date().toISOString();

    updates.onboardingverifiedbyuserid =
      viewer.userId;

    updates.documentsverifiedbyuserid =
      viewer.userId;

    updates.datereceived =
      updates.datereceived ??
      new Date()
        .toISOString()
        .slice(0, 10);
  }

  const {
    error: profileError,
  } = await admin
    .from("staffprofiles")
    .upsert({
      userid:
        params.userid,

      ...updates,
    });

  if (
    profileError
  ) {
    return NextResponse.json(
      {
        error:
          profileError.message,
      },
      {
        status: 400,
      },
    );
  }

  if (
    canEditCore &&
    referencesInput.length >
      0
  ) {
    for (
      const reference
      of referencesInput.slice(
        0,
        2,
      )
    ) {
      const number =
        Number(
          reference?.referencenumber,
        );

      if (
        ![
          1,
          2,
        ].includes(
          number,
        )
      ) {
        continue;
      }

      const clean =
        normalizeProfileValues(
          pickFields(
            reference &&
              typeof reference ===
                "object"
              ? (reference as Record<
                  string,
                  unknown
                >)
              : {},

            REFERENCE_FIELDS,
          ),
        );

      const {
        error:
          referenceError,
      } = await admin
        .from(
          "staffreferences",
        )
        .upsert(
          {
            userid:
              params.userid,

            referencenumber:
              number,

            ...clean,

            updatedat:
              new Date().toISOString(),
          },
          {
            onConflict:
              "userid,referencenumber",
          },
        );

      if (
        referenceError
      ) {
        return NextResponse.json(
          {
            error:
              referenceError.message,
          },
          {
            status: 400,
          },
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,

    onboardingstatus:
      updates.onboardingstatus,
  });
}