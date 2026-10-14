import { NextResponse } from "next/server";
import {
  createClient as createSupabaseAuthClient,
} from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { nextPrefixedId } from "@/lib/client-utils";
import {
  requireApiWriteAccess,
} from "@/lib/viewer";
import {
  canCreateClientOrProject,
} from "@/lib/access";
import {
  sendClientWelcomeEmail,
} from "@/lib/mailer";

function getAppUrl(request: Request) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    new URL(request.url).origin
  ).replace(/\/$/, "");
}

export async function POST(
  request: Request,
) {
  const {
    viewer,
    forbidden,
  } =
    await requireApiWriteAccess(
      "clients",
    );

  if (
    forbidden ||
    !viewer ||
    !canCreateClientOrProject(
      viewer,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Not authorized to create clients.",
      },
      {
        status: 403,
      },
    );
  }

  let body:
    Record<string, unknown>;

  try {
    body =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid request body.",
      },
      {
        status: 400,
      },
    );
  }

  const {
    type,
    name,
    phone,
    email,
    address,

    idType,
    idNumber,
    issuer,
    expiry,

    rcNumber,
    business,

    directorName,
    directorPosition,
    directorDate,

    ownerName,
    ownership,
    ownerContact,

    payment,
    source,
    supportingDoc,

    declaration,
    declarationDate,

    linkedUser,

    risk,
    riskComments,
  } = body;

  const normalizedEmail =
    typeof email === "string"
      ? email
          .trim()
          .toLowerCase()
      : "";

  const normalizedName =
    String(
      name ?? "",
    ).trim();

  const normalizedPhone =
    String(
      phone ?? "",
    ).trim();

  const normalizedAddress =
    String(
      address ?? "",
    ).trim();

  if (
    !type ||
    !normalizedName ||
    !normalizedPhone ||
    !normalizedEmail ||
    !normalizedAddress
  ) {
    return NextResponse.json(
      {
        error:
          "Client type, name, phone number, email address, and address are required.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !normalizedEmail.includes(
      "@",
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Enter a valid email address.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    ![
      "Individual",
      "Corporate",
      "Other",
    ].includes(
      String(type),
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid client type.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    type ===
      "Corporate" &&
    !String(
      directorName ?? "",
    ).trim()
  ) {
    return NextResponse.json(
      {
        error:
          "A Corporate client needs at least one director or authorised signatory.",
      },
      {
        status: 400,
      },
    );
  }

  const admin =
    createAdminClient();

  /*
   * ----------------------------------------------------------
   * GENERATE CLIENT ID
   * ----------------------------------------------------------
   */
  const {
    data: existing,
    error:
      existingClientError,
  } = await admin
    .from("clients")
    .select("clientid");

  if (
    existingClientError
  ) {
    return NextResponse.json(
      {
        error:
          "Could not generate the client code.",
      },
      {
        status: 400,
      },
    );
  }

  const clientid =
    nextPrefixedId(
      (
        existing ??
        []
      ).map(
        (row) =>
          row.clientid,
      ),
      "CLI",
      5,
    );

  const individual =
    type ===
    "Individual";

  const corporate =
    type ===
    "Corporate";

  /*
   * ----------------------------------------------------------
   * OPTIONAL EXISTING CLIENT PORTAL USER
   * ----------------------------------------------------------
   */
  let existingLinkedUser:
    | {
        userid: string;
        fullname: string;
        email: string;
        authuserid:
          | string
          | null;
      }
    | null = null;

  if (linkedUser) {
    const {
      data,
      error,
    } = await admin
      .from("users")
      .select(
        "userid,fullname,email,authuserid,roles!inner(rolename)",
      )
      .eq(
        "userid",
        String(
          linkedUser,
        ),
      )
      .eq(
        "roles.rolename",
        "Client",
      )
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        {
          error:
            "Could not verify the selected Client Portal account.",
        },
        {
          status: 400,
        },
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          error:
            "The selected Client Portal account could not be found.",
        },
        {
          status: 400,
        },
      );
    }

    existingLinkedUser = {
      userid:
        data.userid,

      fullname:
        data.fullname,

      email:
        data.email,

      authuserid:
        data.authuserid,
    };
  }

  /*
   * ----------------------------------------------------------
   * GET CLIENT ROLE
   * ----------------------------------------------------------
   */
  const {
    data: clientRole,
    error: roleError,
  } = await admin
    .from("roles")
    .select(
      "roleid",
    )
    .eq(
      "rolename",
      "Client",
    )
    .maybeSingle();

  if (
    roleError ||
    !clientRole
  ) {
    return NextResponse.json(
      {
        error:
          roleError?.message ??
          'The "Client" role could not be found.',
      },
      {
        status: 400,
      },
    );
  }

  let authUserId:
    | string
    | null =
    existingLinkedUser
      ?.authuserid ??
    null;

  let userId:
    | string
    | null =
    existingLinkedUser
      ?.userid ??
    null;

  let createdAuthUser =
    false;

  let createdDatabaseUser =
    false;

  /*
   * ----------------------------------------------------------
   * CREATE CLIENT PORTAL ACCOUNT WHEN REQUIRED
   * ----------------------------------------------------------
   */
  if (
    !existingLinkedUser
  ) {
    const {
      data:
        existingAppUser,
    } = await admin
      .from("users")
      .select(
        "userid,usertype",
      )
      .ilike(
        "email",
        normalizedEmail,
      )
      .limit(1)
      .maybeSingle();

    if (
      existingAppUser
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
      .select(
        "userid",
      )
      .order(
        "userid",
        {
          ascending:
            false,
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
        ? lastNumber +
          1
        : 1;

    userId =
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
          16,
        )}!A1`;

    const {
      data:
        newAuthUser,
      error:
        authError,
    } =
      await admin.auth.admin.createUser(
        {
          email:
            normalizedEmail,

          password:
            temporaryPassword,

          email_confirm:
            true,
        },
      );

    if (
      authError ||
      !newAuthUser
        ?.user
    ) {
      return NextResponse.json(
        {
          error:
            authError
              ?.message ??
            "Could not create the Client Portal sign-in account.",
        },
        {
          status: 400,
        },
      );
    }

    authUserId =
      newAuthUser.user.id;

    createdAuthUser =
      true;

    const {
      error:
        userError,
    } = await admin
      .from("users")
      .insert({
        userid:
          userId,

        fullname:
          normalizedName,

        usertype:
          "Client",

        email:
          normalizedEmail,

        loginemail:
          normalizedEmail,

        phonenumber:
          normalizedPhone,

        department:
          null,

        accesslevel:
          "Read Only",

        roleid:
          clientRole.roleid,

        passwordhash:
          "SUPABASE_AUTH_MANAGED",

        status:
          "Active",

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
          authUserId,
      });

    if (userError) {
      const {
        error:
          cleanupError,
      } =
        await admin.auth.admin.deleteUser(
          authUserId,
        );

      if (
        cleanupError
      ) {
        console.error(
          "Could not clean up Client Portal Auth user:",
          cleanupError,
        );
      }

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

    createdDatabaseUser =
      true;
  }

  /*
   * ----------------------------------------------------------
   * CREATE CLIENT KYC RECORD
   * ----------------------------------------------------------
   */
  const {
    error:
      clientError,
  } = await admin
    .from("clients")
    .insert({
      clientid,

      clienttype:
        type,

      fullnameorcompanyname:
        normalizedName,

      address:
        normalizedAddress,

      phonenumber:
        normalizedPhone,

      email:
        normalizedEmail,

      idtype:
        individual
          ? idType
          : null,

      idnumber:
        individual
          ? idNumber
          : null,

      issuingauthority:
        individual
          ? issuer
          : null,

      idexpirydate:
        individual
          ? expiry ||
            null
          : null,

      rcnumber:
        corporate
          ? rcNumber
          : null,

      natureofbusiness:
        corporate
          ? business
          : null,

      preferredpaymentmethod:
        payment,

      declarationclientname:
        declaration,

      declarationdate:
        declarationDate,

      linkeduserid:
        userId,

      createdby:
        viewer.userId,
    });

  if (clientError) {
    if (
      createdDatabaseUser &&
      userId
    ) {
      const {
        error:
          cleanupUserError,
      } = await admin
        .from("users")
        .delete()
        .eq(
          "userid",
          userId,
        );

      if (
        cleanupUserError
      ) {
        console.error(
          "Could not clean up Client Portal database user:",
          cleanupUserError,
        );
      }
    }

    if (
      createdAuthUser &&
      authUserId
    ) {
      const {
        error:
          cleanupAuthError,
      } =
        await admin.auth.admin.deleteUser(
          authUserId,
        );

      if (
        cleanupAuthError
      ) {
        console.error(
          "Could not clean up Client Portal Auth user:",
          cleanupAuthError,
        );
      }
    }

    return NextResponse.json(
      {
        error:
          clientError.message,
      },
      {
        status: 400,
      },
    );
  }

  /*
   * ----------------------------------------------------------
   * RELATED KYC RECORDS
   * ----------------------------------------------------------
   */
  const writes:
    PromiseLike<{
      error:
        | {
            message: string;
          }
        | null;
    }>[] = [];

  if (corporate) {
    writes.push(
      admin
        .from(
          "clientdirectors",
        )
        .insert({
          clientid,

          name:
            String(
              directorName,
            ).trim(),

          position:
            String(
              directorPosition ??
                "",
            ).trim() ||
            null,

          signaturedate:
            directorDate ||
            null,
        }),
    );
  }

  if (
    corporate &&
    String(
      ownerName ??
        "",
    ).trim()
  ) {
    writes.push(
      admin
        .from(
          "clientbeneficialowners",
        )
        .insert({
          clientid,

          name:
            String(
              ownerName,
            ).trim(),

          ownershippct:
            ownership !==
            ""
              ? Number(
                  ownership,
                )
              : null,

          contact:
            String(
              ownerContact ??
                "",
            ).trim() ||
            null,
        }),
    );
  }

  if (
    String(
      source ??
        "",
    ).trim()
  ) {
    writes.push(
      admin
        .from(
          "clientsourceoffunds",
        )
        .insert({
          clientid,

          sourcetype:
            String(
              source,
            ).trim(),

          supportingdocumenttype:
            String(
              supportingDoc ??
                "",
            ).trim() ||
            null,
        }),
    );
  }

  if (
    String(
      risk ??
        "",
    ).trim()
  ) {
    writes.push(
      admin
        .from(
          "clientriskassessment",
        )
        .insert({
          clientid,

          riskcategory:
            String(
              risk,
            ).trim(),

          comments:
            String(
              riskComments ??
                "",
            ).trim() ||
            null,

          verifiedbyuserid:
            viewer.userId,

          verificationdate:
            new Date()
              .toISOString()
              .slice(
                0,
                10,
              ),
        }),
    );
  }

  const results =
    await Promise.all(
      writes,
    );

  const failedWrite =
    results.find(
      (result) =>
        result.error,
    );

  if (
    failedWrite?.error
  ) {
    return NextResponse.json(
      {
        clientid,

        error:
          `Client created, but a related KYC item failed: ${failedWrite.error.message}`,
      },
      {
        status: 207,
      },
    );
  }

  /*
   * ----------------------------------------------------------
   * AUDIT LOG
   * ----------------------------------------------------------
   */
  const {
    error:
      auditError,
  } = await admin
    .from(
      "makercheckerauditlog",
    )
    .insert({
      logid:
        `LOG${Date.now()
          .toString()
          .slice(
            -9,
          )}`,

      transactiontype:
        "Client",

      transactionid:
        clientid,

      actiontype:
        "Created",

      actionbyuserid:
        viewer.userId,

      actiondate:
        new Date()
          .toISOString()
          .slice(
            0,
            10,
          ),

      actiontime:
        new Date()
          .toTimeString()
          .slice(
            0,
            8,
          ),

      comments:
        normalizedName,
    });

  if (auditError) {
    console.error(
      "Client audit log failed:",
      auditError,
    );
  }

  /*
   * ----------------------------------------------------------
   * EMAILS
   *
   * Use a fixed production application URL from
   * NEXT_PUBLIC_APP_URL so Vercel preview/internal hostnames
   * are never placed into password setup emails.
   * ----------------------------------------------------------
   */
  const appUrl =
    getAppUrl(
      request,
    );

  const portalUrl =
    `${appUrl}/login`;

  const passwordResetUrl =
    `${appUrl}/login/reset-password`;

  let passwordSetupSent =
    !createdAuthUser;

  let welcomeEmailSent =
    false;

  const emailErrors:
    string[] = [];

  /*
   * Only a newly created Client Portal identity needs the
   * initial password setup email.
   */
  if (
    createdAuthUser &&
    authUserId
  ) {
    try {
      const authMailer =
        createSupabaseAuthClient(
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

              detectSessionInUrl:
                false,
            },
          },
        );

      const {
        error:
          resetError,
      } =
        await authMailer.auth.resetPasswordForEmail(
          normalizedEmail,
          {
            redirectTo:
              passwordResetUrl,
          },
        );

      if (
        resetError
      ) {
        emailErrors.push(
          `Password setup email: ${resetError.message}`,
        );
      } else {
        passwordSetupSent =
          true;
      }
    } catch (
      error
    ) {
      emailErrors.push(
        `Password setup email: ${
          error instanceof
          Error
            ? error.message
            : "Unknown error."
        }`,
      );
    }
  }

  /*
   * The Resend welcome email intentionally contains no raw
   * Supabase one-time authentication URL.
   */
  if (authUserId) {
    const welcomeResult =
      await sendClientWelcomeEmail(
        {
          to:
            normalizedEmail,

          clientName:
            normalizedName,

          email:
            normalizedEmail,

          portalUrl,

          isNewPortalAccount:
            createdAuthUser,

          passwordSetupSent,
        },
      );

    welcomeEmailSent =
      welcomeResult.sent;

    if (
      !welcomeResult.sent &&
      welcomeResult.error
    ) {
      emailErrors.push(
        `Welcome email: ${welcomeResult.error}`,
      );
    }
  } else {
    emailErrors.push(
      "The linked Client Portal account does not have a Supabase Auth identity.",
    );
  }

  const emailSent =
    welcomeEmailSent &&
    passwordSetupSent;

  let message:
    string;

  if (
    createdAuthUser &&
    passwordSetupSent &&
    welcomeEmailSent
  ) {
    message =
      "Client created successfully. Welcome and secure password setup emails were sent.";
  } else if (
    !createdAuthUser &&
    welcomeEmailSent
  ) {
    message =
      "Client created successfully and linked to the existing Client Portal account.";
  } else if (
    createdAuthUser &&
    passwordSetupSent
  ) {
    message =
      "Client created successfully. The secure password setup email was sent, but the welcome email could not be sent.";
  } else {
    message =
      "Client created successfully, but one or more Client Portal emails could not be sent. The client can use Forgot Password from the login page.";
  }

  return NextResponse.json(
    {
      clientid,
      userId,

      emailSent,

      passwordSetupSent,

      welcomeEmailSent,

      emailError:
        emailErrors.length
          ? emailErrors.join(
              " | ",
            )
          : undefined,

      message,
    },
    {
      status: 201,
    },
  );
}