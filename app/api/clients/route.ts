import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nextPrefixedId } from "@/lib/client-utils";
import {
  requireApiWriteAccess,
} from "@/lib/viewer";
import { canCreateClientOrProject } from "@/lib/access";
import { sendClientWelcomeEmail } from "@/lib/mailer";

export async function POST(request: Request) {
  const { viewer, forbidden } =
    await requireApiWriteAccess("clients");

  if (
    forbidden ||
    !viewer ||
    !canCreateClientOrProject(viewer)
  ) {
    return NextResponse.json(
      {
        error:
          "Not authorized to create clients.",
      },
      { status: 403 },
    );
  }

  const body = await request.json();

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
      ? email.trim().toLowerCase()
      : "";

  if (
    !type ||
    !name ||
    !phone ||
    !normalizedEmail ||
    !address
  ) {
    return NextResponse.json(
      {
        error:
          "Client type, name, phone number, email address, and address are required.",
      },
      { status: 400 },
    );
  }

  if (
    ![
      "Individual",
      "Corporate",
      "Other",
    ].includes(type)
  ) {
    return NextResponse.json(
      {
        error: "Invalid client type.",
      },
      { status: 400 },
    );
  }

  if (
    type === "Corporate" &&
    !String(directorName ?? "").trim()
  ) {
    return NextResponse.json(
      {
        error:
          "A Corporate client needs at least one director or authorised signatory.",
      },
      { status: 400 },
    );
  }

  const supabase = createClient();
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("clients")
    .select("clientid");

  const clientid = nextPrefixedId(
    (existing ?? []).map(
      (row) => row.clientid,
    ),
    "CLI",
    5,
  );

  const individual = type === "Individual";
  const corporate = type === "Corporate";

  let existingLinkedUser:
    | {
        userid: string;
        fullname: string;
        email: string;
        authuserid: string | null;
      }
    | null = null;

  if (linkedUser) {
    const { data, error } = await admin
      .from("users")
      .select(
        "userid,fullname,email,authuserid,roles!inner(rolename)",
      )
      .eq("userid", linkedUser)
      .eq("roles.rolename", "Client")
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        {
          error:
            "Could not verify the selected Client Portal account.",
        },
        { status: 400 },
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          error:
            "The selected Client Portal account could not be found.",
        },
        { status: 400 },
      );
    }

    existingLinkedUser = {
      userid: data.userid,
      fullname: data.fullname,
      email: data.email,
      authuserid: data.authuserid,
    };
  }

  const {
    data: clientRole,
    error: roleError,
  } = await admin
    .from("roles")
    .select("roleid")
    .eq("rolename", "Client")
    .maybeSingle();

  if (roleError || !clientRole) {
    return NextResponse.json(
      {
        error:
          roleError?.message ??
          'The "Client" role could not be found.',
      },
      { status: 400 },
    );
  }

  let authUserId: string | null =
    existingLinkedUser?.authuserid ?? null;

  let userId =
    existingLinkedUser?.userid ?? null;

  let temporaryPassword: string | null = null;
  let createdAuthUser = false;
  let createdDatabaseUser = false;

  if (!existingLinkedUser) {
    const { data: lastUser } = await admin
      .from("users")
      .select("userid")
      .order("userid", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    const lastNumber = lastUser
      ? Number.parseInt(
          lastUser.userid.replace("USR", ""),
          10,
        )
      : 0;

    userId = `USR${String(
      lastNumber + 1,
    ).padStart(5, "0")}`;

    temporaryPassword = `${crypto
      .randomUUID()
      .replace(/-/g, "")
      .slice(0, 10)}!A1`;

    const {
      data: newAuthUser,
      error: authError,
    } =
      await admin.auth.admin.createUser({
        email: normalizedEmail,
        password: temporaryPassword,
        email_confirm: true,
      });

    if (
      authError ||
      !newAuthUser?.user
    ) {
      return NextResponse.json(
        {
          error:
            authError?.message ??
            "Could not create the Client Portal sign-in account.",
        },
        { status: 400 },
      );
    }

    authUserId = newAuthUser.user.id;
    createdAuthUser = true;

    const {
      error: userError,
    } = await admin
      .from("users")
      .insert({
        userid: userId,
        fullname: String(name).trim(),
        usertype: "Client",
        email: normalizedEmail,
        loginemail: normalizedEmail,
        phonenumber: String(phone).trim(),
        department: null,
        accesslevel: "Read Only",
        roleid: clientRole.roleid,
        passwordhash:
          "SUPABASE_AUTH_MANAGED",
        status: "Active",
        datecreated: new Date()
          .toISOString()
          .slice(0, 10),
        createdby: viewer.userId,
        authuserid: authUserId,
      });

    if (userError) {
      await admin.auth.admin.deleteUser(
        authUserId,
      );

      return NextResponse.json(
        {
          error: userError.message,
        },
        { status: 400 },
      );
    }

    createdDatabaseUser = true;
  }

  const {
    error: clientError,
  } = await admin
    .from("clients")
    .insert({
      clientid,
      clienttype: type,
      fullnameorcompanyname:
        String(name).trim(),
      address: String(address).trim(),
      phonenumber: String(phone).trim(),
      email: normalizedEmail,

      idtype: individual
        ? idType
        : null,
      idnumber: individual
        ? idNumber
        : null,
      issuingauthority: individual
        ? issuer
        : null,
      idexpirydate: individual
        ? expiry || null
        : null,

      rcnumber: corporate
        ? rcNumber
        : null,
      natureofbusiness: corporate
        ? business
        : null,

      preferredpaymentmethod:
        payment,

      declarationclientname:
        declaration,
      declarationdate:
        declarationDate,

      linkeduserid: userId,

      createdby: viewer.userId,
    });

  if (clientError) {
    if (
      createdAuthUser &&
      authUserId
    ) {
      await admin.auth.admin.deleteUser(
        authUserId,
      );
    }

    if (
      createdDatabaseUser &&
      userId
    ) {
      await admin
        .from("users")
        .delete()
        .eq("userid", userId);
    }

    return NextResponse.json(
      {
        error: clientError.message,
      },
      { status: 400 },
    );
  }

  const writes: PromiseLike<{
    error: {
      message: string;
    } | null;
  }>[] = [];

  if (corporate) {
    writes.push(
      admin
        .from("clientdirectors")
        .insert({
          clientid,
          name: String(
            directorName,
          ).trim(),
          position:
            String(
              directorPosition ?? "",
            ).trim() || null,
          signaturedate:
            directorDate || null,
        }),
    );
  }

  if (
    corporate &&
    String(ownerName ?? "").trim()
  ) {
    writes.push(
      admin
        .from("clientbeneficialowners")
        .insert({
          clientid,
          name: String(
            ownerName,
          ).trim(),
          ownershippct:
            ownership !== ""
              ? Number(ownership)
              : null,
          contact:
            String(
              ownerContact ?? "",
            ).trim() || null,
        }),
    );
  }

  if (
    String(source ?? "").trim()
  ) {
    writes.push(
      admin
        .from("clientsourceoffunds")
        .insert({
          clientid,
          sourcetype:
            String(source).trim(),
          supportingdocumenttype:
            String(
              supportingDoc ?? "",
            ).trim() || null,
        }),
    );
  }

  if (
    String(risk ?? "").trim()
  ) {
    writes.push(
      admin
        .from("clientriskassessment")
        .insert({
          clientid,
          riskcategory:
            String(risk).trim(),
          comments:
            String(
              riskComments ?? "",
            ).trim() || null,
          verifiedbyuserid:
            viewer.userId,
          verificationdate:
            new Date()
              .toISOString()
              .slice(0, 10),
        }),
    );
  }

  const results =
    await Promise.all(writes);

  const failedWrite = results.find(
    (result) => result.error,
  );

  if (failedWrite?.error) {
    return NextResponse.json(
      {
        clientid,
        error:
          `Client created, but a related KYC item failed: ${failedWrite.error.message}`,
      },
      { status: 207 },
    );
  }

  await admin
    .from("makercheckerauditlog")
    .insert({
      logid: `LOG${Date.now()
        .toString()
        .slice(-9)}`,
      transactiontype: "Client",
      transactionid: clientid,
      actiontype: "Created",
      actionbyuserid:
        viewer.userId,
      actiondate: new Date()
        .toISOString()
        .slice(0, 10),
      actiontime: new Date()
        .toTimeString()
        .slice(0, 8),
      comments:
        String(name).trim(),
    });

  let emailSent = false;
  let emailError:
    | string
    | undefined;

  if (authUserId) {
    const {
      data: recoveryLink,
      error: recoveryError,
    } =
      await admin.auth.admin.generateLink(
        {
          type: "recovery",
          email: normalizedEmail,
          options: {
            redirectTo:
              `${new URL(request.url).origin}/login/reset-password`,
          },
        },
      );

    if (
      recoveryError ||
      !recoveryLink?.properties
        ?.action_link
    ) {
      emailError =
        recoveryError?.message ??
        "Could not generate the password reset link.";
    } else {
      const portalUrl =
        `${new URL(request.url).origin}/login`;

      const emailResult =
        await sendClientWelcomeEmail({
          to: normalizedEmail,
          clientName:
            String(name).trim(),
          email: normalizedEmail,
          temporaryPassword:
            temporaryPassword ??
            "Use your existing account password.",
          resetLink:
            recoveryLink.properties
              .action_link,
          portalUrl,
        });

      emailSent =
        emailResult.sent;

      if (!emailResult.sent) {
        emailError =
          emailResult.error;
      }
    }
  }

  return NextResponse.json(
    {
      clientid,
      userId,
      emailSent,
      emailError,
      message: emailSent
        ? "Client created and Client Portal login instructions sent."
        : "Client created, but the Client Portal email could not be sent.",
    },
    { status: 201 },
  );
}