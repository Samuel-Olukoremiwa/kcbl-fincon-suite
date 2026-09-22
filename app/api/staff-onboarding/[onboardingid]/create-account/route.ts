import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/viewer";
import {
  ASSIGNABLE_STAFF_ROLES,
  SUPER_USER_ROLE,
  deriveAccessLevel,
  isStaffDepartment,
} from "@/lib/roles";
import { canCreateStaffSystemAccount } from "@/lib/staff-records";

const PROFILE_COPY_FIELDS = [
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
  "bankname",
  "bankaccountname",
  "bankaccountnumber",
  "tin",
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
  "datereceived",
  "documentsverifiedbyuserid",
  "employmentletterissued",
  "staffidassigned",
  "ppeissued",
  "hseinductioncompleted",
  "stafffilecreated",
  "medicalresultgood",
  "adminremarks",
  "employmentstatus",
  "onboardingsubmittedat",
  "onboardingverifiedat",
  "onboardingverifiedbyuserid",
] as const;

function pickProfile(onboarding: Record<string, any>) {
  return Object.fromEntries(
    PROFILE_COPY_FIELDS.map((field) => [
      field,
      onboarding[field],
    ]),
  );
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: {
      onboardingid: string;
    };
  },
) {
  const viewer =
    await requireStaff();

  if (
    !canCreateStaffSystemAccount(
      viewer,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Only Business Development or a Super User can create a system account from verified onboarding.",
      },
      {
        status: 403,
      },
    );
  }

  const onboardingid =
    Number(
      params.onboardingid,
    );

  if (
    !Number.isInteger(
      onboardingid,
    ) ||
    onboardingid <= 0
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid onboarding record.",
      },
      {
        status: 400,
      },
    );
  }

  const body =
    await request.json();

  const role =
    String(
      body.role ?? "",
    ).trim();

  const department =
    String(
      body.department ?? "",
    ).trim();

  const projectid =
    String(
      body.projectid ?? "",
    ).trim();

  if (
    !role ||
    !department
  ) {
    return NextResponse.json(
      {
        error:
          "Role and department are required.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !(
      ASSIGNABLE_STAFF_ROLES as readonly string[]
    ).includes(
      role,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Select a valid staff role.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !isStaffDepartment(
      department,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Select a valid staff department.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    role ===
      SUPER_USER_ROLE &&
    viewer.roleName !==
      SUPER_USER_ROLE
  ) {
    return NextResponse.json(
      {
        error:
          "Only a current Super User can assign the Super User role.",
      },
      {
        status: 403,
      },
    );
  }

  if (
    department ===
      "Operations" &&
    !projectid
  ) {
    return NextResponse.json(
      {
        error:
          "Operations staff must be assigned to a project code.",
      },
      {
        status: 400,
      },
    );
  }

  const admin =
    createAdminClient();

  const {
    data: onboarding,
    error:
      onboardingError,
  } = await admin
    .from(
      "staffonboarding",
    )
    .select("*")
    .eq(
      "onboardingid",
      onboardingid,
    )
    .maybeSingle();

  if (
    onboardingError ||
    !onboarding
  ) {
    return NextResponse.json(
      {
        error:
          onboardingError?.message ??
          "Staff onboarding record not found.",
      },
      {
        status: 404,
      },
    );
  }

  if (
    onboarding.onboardingstatus !==
    "Verified"
  ) {
    return NextResponse.json(
      {
        error:
          "Staff onboarding must be verified before a system account can be created.",
      },
      {
        status: 409,
      },
    );
  }

  if (
    onboarding.createduserid
  ) {
    return NextResponse.json(
      {
        error:
          "A system account has already been created for this staff member.",
        userId:
          onboarding.createduserid,
      },
      {
        status: 409,
      },
    );
  }

  const fullname =
    String(
      onboarding.fullname ??
        "",
    ).trim();

  const email =
    String(
      onboarding.email ?? "",
    )
      .trim()
      .toLowerCase();

  const phonenumber =
    String(
      onboarding.phonenumber ??
        "",
    ).trim();

  if (
    !fullname ||
    !email ||
    !phonenumber ||
    !email.includes("@")
  ) {
    return NextResponse.json(
      {
        error:
          "The verified onboarding record is missing valid account identity details.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    department ===
    "Operations"
  ) {
    const {
      data: project,
    } = await admin
      .from("projects")
      .select(
        "projectid",
      )
      .eq(
        "projectid",
        projectid,
      )
      .maybeSingle();

    if (!project) {
      return NextResponse.json(
        {
          error:
            "The selected project code does not exist.",
        },
        {
          status: 400,
        },
      );
    }
  }

  const [
    {
      data: roleRow,
      error:
        roleError,
    },
    {
      data:
        existingUser,
    },
  ] =
    await Promise.all([
      admin
        .from("roles")
        .select(
          "roleid",
        )
        .eq(
          "rolename",
          role,
        )
        .single(),

      admin
        .from("users")
        .select(
          "userid",
        )
        .ilike(
          "email",
          email,
        )
        .limit(1)
        .maybeSingle(),
    ]);

  if (
    roleError ||
    !roleRow
  ) {
    return NextResponse.json(
      {
        error:
          roleError?.message ??
          "Could not find the selected staff role.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    existingUser
  ) {
    return NextResponse.json(
      {
        error:
          "A system user already exists with this email address.",
      },
      {
        status: 409,
      },
    );
  }

  const {
    data: lastUser,
  } = await admin
    .from("users")
    .select("userid")
    .order(
      "userid",
      {
        ascending: false,
      },
    )
    .limit(1)
    .maybeSingle();

  const lastNumber =
    lastUser
      ? Number.parseInt(
          String(
            lastUser.userid,
          ).replace(
            "USR",
            "",
          ),
          10,
        )
      : 0;

  const nextNumber =
    Number.isFinite(
      lastNumber,
    )
      ? lastNumber + 1
      : 1;

  const newUserId =
    `USR${String(
      nextNumber,
    ).padStart(
      5,
      "0",
    )}`;

  const temporaryPassword =
    `${crypto
      .randomUUID()
      .replace(
        /-/g,
        "",
      )
      .slice(
        0,
        10,
      )}!A1`;

  const {
    data:
      newAuthUser,
    error:
      authError,
  } =
    await admin.auth.admin.createUser(
      {
        email,
        password:
          temporaryPassword,
        email_confirm:
          true,
      },
    );

  if (
    authError ||
    !newAuthUser?.user
  ) {
    return NextResponse.json(
      {
        error:
          authError?.message ??
          "Could not create the secure sign-in account.",
      },
      {
        status: 400,
      },
    );
  }

  /*
   * Keep the validated Auth user in a stable,
   * non-null local variable.
   *
   * TypeScript does not preserve the
   * newAuthUser.user narrowing inside nested
   * cleanup functions.
   */
  const authUser =
    newAuthUser.user;

  async function cleanupCreatedAccount() {
    await admin
      .from(
        "projectassignments",
      )
      .delete()
      .eq(
        "userid",
        newUserId,
      );

    await admin
      .from(
        "staffdocuments",
      )
      .delete()
      .eq(
        "userid",
        newUserId,
      );

    await admin
      .from(
        "staffreferences",
      )
      .delete()
      .eq(
        "userid",
        newUserId,
      );

    await admin
      .from(
        "staffprofiles",
      )
      .delete()
      .eq(
        "userid",
        newUserId,
      );

    await admin
      .from("users")
      .delete()
      .eq(
        "userid",
        newUserId,
      );

    await admin.auth.admin.deleteUser(
      authUser.id,
    );
  }

  const accessLevel =
    deriveAccessLevel({
      userType:
        "Staff",
      roleName:
        role,
    });

  const {
    error:
      userError,
  } = await admin
    .from("users")
    .insert({
      userid:
        newUserId,

      fullname,

      usertype:
        "Staff",

      email,

      loginemail:
        email,

      phonenumber,

      department,

      accesslevel:
        accessLevel,

      roleid:
        roleRow.roleid,

      passwordhash:
        "SUPABASE_AUTH_MANAGED",

      status:
        "Pending",

      datecreated:
        new Date()
          .toISOString()
          .slice(
            0,
            10,
          ),

      createdby:
        viewer.userId,

      authuserid:
        authUser.id,
    });

  if (
    userError
  ) {
    await admin.auth.admin.deleteUser(
      authUser.id,
    );

    return NextResponse.json(
      {
        error:
          userError.message,
      },
      {
        status: 400,
      },
    );
  }

  const {
    error:
      profileError,
  } = await admin
    .from(
      "staffprofiles",
    )
    .insert({
      userid:
        newUserId,

      ...pickProfile(
        onboarding,
      ),

      onboardingstatus:
        "Verified",

      employmentstatus:
        onboarding.employmentstatus ??
        "Active",

      updatedat:
        new Date().toISOString(),

      updatedbyuserid:
        viewer.userId,
    });

  if (
    profileError
  ) {
    await cleanupCreatedAccount();

    return NextResponse.json(
      {
        error:
          `Could not create the linked staff profile: ${profileError.message}`,
      },
      {
        status: 400,
      },
    );
  }

  const [
    {
      data:
        references,
    },
    {
      data:
        documents,
    },
  ] =
    await Promise.all([
      admin
        .from(
          "staffonboardingreferences",
        )
        .select(
          "referencenumber,fullname,relationshipposition,organisation,address,phone",
        )
        .eq(
          "onboardingid",
          onboardingid,
        ),

      admin
        .from(
          "staffonboardingdocuments",
        )
        .select(
          "documenttype,filename,storagepath,mimetype,filesize,uploadedbyuserid,uploadedat,verified,verifiedbyuserid,verifiedat,verificationremarks",
        )
        .eq(
          "onboardingid",
          onboardingid,
        ),
    ]);

  if (
    references?.length
  ) {
    const {
      error:
        referenceError,
    } = await admin
      .from(
        "staffreferences",
      )
      .insert(
        references.map(
          (
            reference,
          ) => ({
            userid:
              newUserId,

            ...reference,
          }),
        ),
      );

    if (
      referenceError
    ) {
      await cleanupCreatedAccount();

      return NextResponse.json(
        {
          error:
            `Could not copy staff references: ${referenceError.message}`,
        },
        {
          status: 400,
        },
      );
    }
  }

  if (
    documents?.length
  ) {
    const {
      error:
        documentError,
    } = await admin
      .from(
        "staffdocuments",
      )
      .insert(
        documents.map(
          (
            document,
          ) => ({
            userid:
              newUserId,

            ...document,
          }),
        ),
      );

    if (
      documentError
    ) {
      await cleanupCreatedAccount();

      return NextResponse.json(
        {
          error:
            `Could not copy staff documents: ${documentError.message}`,
        },
        {
          status: 400,
        },
      );
    }
  }

  if (
    department ===
    "Operations"
  ) {
    const {
      error:
        assignmentError,
    } = await admin
      .from(
        "projectassignments",
      )
      .insert({
        projectid,

        userid:
          newUserId,

        assignmentrole:
          "Operations Staff",

        assignedbyuserid:
          viewer.userId,

        approvalstatus:
          "Pending",

        active:
          false,
      });

    if (
      assignmentError
    ) {
      await cleanupCreatedAccount();

      return NextResponse.json(
        {
          error:
            `Could not create the Operations project assignment: ${assignmentError.message}`,
        },
        {
          status: 400,
        },
      );
    }
  }

  const {
    data:
      linkedOnboarding,
    error:
      linkError,
  } = await admin
    .from(
      "staffonboarding",
    )
    .update({
      onboardingstatus:
        "Account Created",

      createduserid:
        newUserId,

      accountcreatedat:
        new Date().toISOString(),

      accountcreatedbyuserid:
        viewer.userId,

      updatedat:
        new Date().toISOString(),

      updatedbyuserid:
        viewer.userId,
    })
    .eq(
      "onboardingid",
      onboardingid,
    )
    .eq(
      "onboardingstatus",
      "Verified",
    )
    .is(
      "createduserid",
      null,
    )
    .select(
      "onboardingid",
    )
    .maybeSingle();

  if (
    linkError ||
    !linkedOnboarding
  ) {
    await cleanupCreatedAccount();

    return NextResponse.json(
      {
        error:
          linkError?.message ??
          "This onboarding record was changed by another account-creation attempt. No duplicate account was kept.",
      },
      {
        status: 409,
      },
    );
  }

  let emailSent =
    false;

  let emailError:
    | string
    | null =
    null;

  try {
    const mailer =
      createSupabaseClient(
        process.env
          .NEXT_PUBLIC_SUPABASE_URL!,
        process.env
          .NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: {
            persistSession:
              false,
            autoRefreshToken:
              false,
          },
        },
      );

    const {
      error:
        resetError,
    } =
      await mailer.auth.resetPasswordForEmail(
        email,
        {
          redirectTo:
            `${new URL(
              request.url,
            ).origin}/login/reset-password`,
        },
      );

    if (
      resetError
    ) {
      emailError =
        resetError.message;
    } else {
      emailSent =
        true;
    }
  } catch (
    error
  ) {
    emailError =
      error instanceof
      Error
        ? error.message
        : "Password setup email failed.";
  }

  return NextResponse.json(
    {
      ok: true,

      userId:
        newUserId,

      emailSent,

      emailError,

      message:
        "System user account created from the verified onboarding record. MD Office must approve the account before sign-in.",
    },
    {
      status: 201,
    },
  );
}