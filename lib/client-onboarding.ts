import { createAdminClient } from "@/lib/supabase/admin";
import { nextPrefixedId } from "@/lib/client-utils";
import { sendClientWelcomeEmail } from "@/lib/mailer";

export type ClientOnboardingPayload = {
  type: "Individual" | "Corporate" | "Other";
  name: string;
  phone: string;
  email: string;
  address: string;

  idType: string;
  idNumber: string;
  issuer: string;
  expiry: string;

  rcNumber: string;
  business: string;
  directorName: string;
  directorPosition: string;
  directorDate: string;

  ownerName: string;
  ownership: string;
  ownerContact: string;

  payment: string;
  source: string;
  supportingDoc: string;

  declaration: string;
  declarationDate: string;

  linkedUser: string;

  risk: string;
  riskComments: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizeClientOnboardingPayload(
  body: Record<string, unknown>,
): ClientOnboardingPayload {
  return {
    type: text(body.type) as ClientOnboardingPayload["type"],
    name: text(body.name),
    phone: text(body.phone),
    email: text(body.email).toLowerCase(),
    address: text(body.address),

    idType: text(body.idType),
    idNumber: text(body.idNumber),
    issuer: text(body.issuer),
    expiry: text(body.expiry),

    rcNumber: text(body.rcNumber),
    business: text(body.business),
    directorName: text(body.directorName),
    directorPosition: text(body.directorPosition),
    directorDate: text(body.directorDate),

    ownerName: text(body.ownerName),
    ownership: text(body.ownership),
    ownerContact: text(body.ownerContact),

    payment: text(body.payment),
    source: text(body.source),
    supportingDoc: text(body.supportingDoc),

    declaration: text(body.declaration),
    declarationDate: text(body.declarationDate),

    linkedUser: text(body.linkedUser),

    risk: text(body.risk),
    riskComments: text(body.riskComments),
  };
}

export function validateClientOnboardingPayload(
  payload: ClientOnboardingPayload,
) {
  if (
    !payload.type ||
    !payload.name ||
    !payload.phone ||
    !payload.email ||
    !payload.address
  ) {
    return "Client type, name, phone number, email address, and address are required.";
  }

  if (!payload.email.includes("@")) {
    return "Enter a valid email address.";
  }

  if (
    ![
      "Individual",
      "Corporate",
      "Other",
    ].includes(payload.type)
  ) {
    return "Invalid client type.";
  }

  if (
    payload.type === "Individual" &&
    (
      !payload.idType ||
      !payload.idNumber ||
      !payload.issuer ||
      !payload.expiry
    )
  ) {
    return "Individual clients require complete identification details.";
  }

  if (
    payload.type === "Corporate" &&
    (
      !payload.rcNumber ||
      !payload.business ||
      !payload.directorName ||
      !payload.directorPosition
    )
  ) {
    return "Corporate clients require the RC number, nature of business, and at least one director or authorised signatory.";
  }

  if (!payload.payment) {
    return "Preferred payment method is required.";
  }

  if (
    !payload.declaration ||
    !payload.declarationDate
  ) {
    return "Declaration name and declaration date are required.";
  }

  if (
    payload.ownership &&
    (
      !Number.isFinite(
        Number(payload.ownership),
      ) ||
      Number(payload.ownership) < 10 ||
      Number(payload.ownership) > 100
    )
  ) {
    return "Beneficial ownership percentage must be between 10 and 100.";
  }

  return null;
}

function getAppUrl(request: Request) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    new URL(request.url).origin
  ).replace(/\/$/, "");
}

function generateTemporaryPassword() {
  return `${crypto
    .randomUUID()
    .replace(/-/g, "")
    .slice(0, 12)}!A1`;
}

async function cleanUpFailedClient({
  clientid,
  userId,
  authUserId,
  createdDatabaseUser,
  createdAuthUser,
}: {
  clientid: string | null;
  userId: string | null;
  authUserId: string | null;
  createdDatabaseUser: boolean;
  createdAuthUser: boolean;
}) {
  const admin = createAdminClient();

  if (clientid) {
    await admin
      .from("clientriskassessment")
      .delete()
      .eq("clientid", clientid);

    await admin
      .from("clientsourceoffunds")
      .delete()
      .eq("clientid", clientid);

    await admin
      .from("clientbeneficialowners")
      .delete()
      .eq("clientid", clientid);

    await admin
      .from("clientdirectors")
      .delete()
      .eq("clientid", clientid);

    await admin
      .from("clients")
      .delete()
      .eq("clientid", clientid);
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

  if (
    createdAuthUser &&
    authUserId
  ) {
    await admin.auth.admin.deleteUser(
      authUserId,
    );
  }
}

export async function createApprovedClient({
  payload,
  request,
  recordCreatedByUserId,
  actionByUserId,
  auditComment,
}: {
  payload: ClientOnboardingPayload;
  request: Request;
  recordCreatedByUserId: string;
  actionByUserId: string;
  auditComment?: string;
}) {
  const validationError =
    validateClientOnboardingPayload(payload);

  if (validationError) {
    return {
      ok: false as const,
      status: 400,
      error: validationError,
    };
  }

  const admin = createAdminClient();

  const {
    data: existing,
    error: existingClientError,
  } = await admin
    .from("clients")
    .select("clientid");

  if (existingClientError) {
    return {
      ok: false as const,
      status: 400,
      error:
        "Could not generate the client code.",
    };
  }

  const clientid = nextPrefixedId(
    (existing ?? []).map(
      (row) => row.clientid,
    ),
    "CLI",
    5,
  );

  const individual =
    payload.type === "Individual";

  const corporate =
    payload.type === "Corporate";

  let existingLinkedUser:
    | {
        userid: string;
        fullname: string;
        email: string;
        authuserid: string | null;
      }
    | null = null;

  if (payload.linkedUser) {
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
        payload.linkedUser,
      )
      .eq(
        "roles.rolename",
        "Client",
      )
      .maybeSingle();

    if (error) {
      return {
        ok: false as const,
        status: 400,
        error:
          "Could not verify the selected Client Portal account.",
      };
    }

    if (!data) {
      return {
        ok: false as const,
        status: 400,
        error:
          "The selected Client Portal account could not be found.",
      };
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

  if (
    roleError ||
    !clientRole
  ) {
    return {
      ok: false as const,
      status: 400,
      error:
        roleError?.message ??
        'The "Client" role could not be found.',
    };
  }

  let authUserId =
    existingLinkedUser?.authuserid ??
    null;

  let userId =
    existingLinkedUser?.userid ??
    null;

  let temporaryPassword:
    string |
    null = null;

  let createdAuthUser =
    false;

  let createdDatabaseUser =
    false;

  if (!existingLinkedUser) {
    const {
      data: existingAppUser,
    } = await admin
      .from("users")
      .select("userid,usertype")
      .ilike(
        "email",
        payload.email,
      )
      .limit(1)
      .maybeSingle();

    if (existingAppUser) {
      return {
        ok: false as const,
        status: 409,
        error:
          "A system user already exists with this email address. Link the existing Client Portal account instead.",
      };
    }

    const {
      data: lastUser,
    } = await admin
      .from("users")
      .select("userid")
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
        ? lastNumber + 1
        : 1;

    userId =
      `USR${String(
        nextNumber,
      ).padStart(
        5,
        "0",
      )}`;

    temporaryPassword =
      generateTemporaryPassword();

    const {
      data: newAuthUser,
      error: authError,
    } =
      await admin.auth.admin.createUser({
        email:
          payload.email,
        password:
          temporaryPassword,
        email_confirm:
          true,
      });

    if (
      authError ||
      !newAuthUser?.user
    ) {
      return {
        ok: false as const,
        status: 400,
        error:
          authError?.message ??
          "Could not create the Client Portal sign-in account.",
      };
    }

    authUserId =
      newAuthUser.user.id;

    createdAuthUser =
      true;

    const {
      error: userError,
    } = await admin
      .from("users")
      .insert({
        userid:
          userId,
        fullname:
          payload.name,
        usertype:
          "Client",
        email:
          payload.email,
        loginemail:
          payload.email,
        phonenumber:
          payload.phone,
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
        mustchangepassword:
          true,
        datecreated:
          new Date()
            .toISOString()
            .slice(
              0,
              10,
            ),
        createdby:
          recordCreatedByUserId,
        authuserid:
          authUserId,
      });

    if (userError) {
      await admin.auth.admin.deleteUser(
        authUserId,
      );

      return {
        ok: false as const,
        status: 400,
        error:
          userError.message,
      };
    }

    createdDatabaseUser =
      true;
  }

  const {
    error: clientError,
  } = await admin
    .from("clients")
    .insert({
      clientid,
      clienttype:
        payload.type,
      fullnameorcompanyname:
        payload.name,
      address:
        payload.address,
      phonenumber:
        payload.phone,
      email:
        payload.email,
      idtype:
        individual
          ? payload.idType
          : null,
      idnumber:
        individual
          ? payload.idNumber
          : null,
      issuingauthority:
        individual
          ? payload.issuer
          : null,
      idexpirydate:
        individual
          ? payload.expiry ||
            null
          : null,
      rcnumber:
        corporate
          ? payload.rcNumber
          : null,
      natureofbusiness:
        corporate
          ? payload.business
          : null,
      preferredpaymentmethod:
        payload.payment,
      declarationclientname:
        payload.declaration,
      declarationdate:
        payload.declarationDate,
      linkeduserid:
        userId,
      createdby:
        recordCreatedByUserId,
    });

  if (clientError) {
    await cleanUpFailedClient({
      clientid: null,
      userId,
      authUserId,
      createdDatabaseUser,
      createdAuthUser,
    });

    return {
      ok: false as const,
      status: 400,
      error:
        clientError.message,
    };
  }

  async function failKyc(
    errorMessage: string,
  ) {
    await cleanUpFailedClient({
      clientid,
      userId,
      authUserId,
      createdDatabaseUser,
      createdAuthUser,
    });

    return {
      ok: false as const,
      status: 400,
      error:
        `Could not complete the client KYC record: ${errorMessage}`,
    };
  }

  if (corporate) {
    const {
      error,
    } = await admin
      .from(
        "clientdirectors",
      )
      .insert({
        clientid,
        name:
          payload.directorName,
        position:
          payload.directorPosition ||
          null,
        signaturedate:
          payload.directorDate ||
          null,
      });

    if (error) {
      return failKyc(
        error.message,
      );
    }
  }

  if (
    corporate &&
    payload.ownerName
  ) {
    const {
      error,
    } = await admin
      .from(
        "clientbeneficialowners",
      )
      .insert({
        clientid,
        name:
          payload.ownerName,
        ownershippct:
          payload.ownership
            ? Number(
                payload.ownership,
              )
            : null,
        contact:
          payload.ownerContact ||
          null,
      });

    if (error) {
      return failKyc(
        error.message,
      );
    }
  }

  if (payload.source) {
    const {
      error,
    } = await admin
      .from(
        "clientsourceoffunds",
      )
      .insert({
        clientid,
        sourcetype:
          payload.source,
        supportingdocumenttype:
          payload.supportingDoc ||
          null,
      });

    if (error) {
      return failKyc(
        error.message,
      );
    }
  }

  if (payload.risk) {
    const {
      error,
    } = await admin
      .from(
        "clientriskassessment",
      )
      .insert({
        clientid,
        riskcategory:
          payload.risk,
        comments:
          payload.riskComments ||
          null,
        verifiedbyuserid:
          actionByUserId,
        verificationdate:
          new Date()
            .toISOString()
            .slice(
              0,
              10,
            ),
      });

    if (error) {
      return failKyc(
        error.message,
      );
    }
  }

  const {
    error: auditError,
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
        actionByUserId,
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
        auditComment ??
        payload.name,
    });

  if (auditError) {
    console.error(
      "Client audit log failed:",
      auditError,
    );
  }

  const portalUrl =
    `${getAppUrl(
      request,
    )}/login`;

  const loginEmail =
    existingLinkedUser?.email ??
    payload.email;

  let emailSent =
    false;

  let emailError:
    string |
    undefined;

  if (authUserId) {
    const emailResult =
      await sendClientWelcomeEmail({
        to:
          loginEmail,
        clientName:
          payload.name,
        email:
          loginEmail,
        temporaryPassword:
          createdAuthUser
            ? temporaryPassword
            : null,
        portalUrl,
        isNewPortalAccount:
          createdAuthUser,
      });

    emailSent =
      emailResult.sent;

    if (
      !emailResult.sent
    ) {
      emailError =
        emailResult.error;
    }
  } else {
    emailError =
      "The linked Client Portal account does not have a Supabase Auth identity.";
  }

  return {
    ok: true as const,
    status: 201,
    clientid,
    userId,
    emailSent,
    emailError,
    createdAuthUser,
  };
}
