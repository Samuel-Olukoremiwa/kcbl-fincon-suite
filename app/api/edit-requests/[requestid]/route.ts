import { NextResponse } from "next/server";

import {
  canAccess,
  canDecideEditRequest,
  type EditRequestEntityType,
} from "@/lib/access";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/viewer";

const EDITABLE_FIELDS:
  Record<
    EditRequestEntityType,
    string[]
  > = {
    client: [
      "email",
      "address",
      "idtype",
      "idnumber",
      "issuingauthority",
      "idexpirydate",
    ],

    supplier: [
      "phonenumber",
      "email",
      "address",
      "supplycategory",
      "description",
    ],

    subcontractor: [
      "phonenumber",
      "email",
      "address",
      "tradespecialty",
      "description",
    ],
  };

const TABLE_NAME:
  Record<
    EditRequestEntityType,
    string
  > = {
    client: "clients",
    supplier: "suppliers",
    subcontractor:
      "subcontractors",
  };

const ID_COLUMN:
  Record<
    EditRequestEntityType,
    string
  > = {
    client: "clientid",
    supplier: "supplierid",
    subcontractor:
      "subcontractorid",
  };

const GENERIC_EDIT_ENTITY_TYPES:
  EditRequestEntityType[] = [
    "client",
    "supplier",
    "subcontractor",
  ];

function isEditRequestEntityType(
  value: unknown,
): value is EditRequestEntityType {
  return GENERIC_EDIT_ENTITY_TYPES.includes(
    value as EditRequestEntityType,
  );
}

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: {
      requestid: string;
    };
  },
) {
  const viewer =
    await requireStaff();

  if (
    !canAccess(
      viewer,
      "editRequests",
    )
  ) {
    return NextResponse.json(
      {
        error:
          "You are not authorized to review update requests.",
      },
      {
        status: 403,
      },
    );
  }

  const {
    status,
    comments,
  } =
    await request.json();

  const reviewComments =
    typeof comments ===
    "string"
      ? comments.trim()
      : "";

  if (
    ![
      "Approved",
      "Rejected",
    ].includes(
      status,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Status must be Approved or Rejected.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    status ===
      "Rejected" &&
    !reviewComments
  ) {
    return NextResponse.json(
      {
        error:
          "A rejection reason is required.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    createClient();

  const admin =
    createAdminClient();

  const {
    data:
      editRequest,
    error:
      fetchError,
  } = await supabase
    .from(
      "recordeditrequests",
    )
    .select("*")
    .eq(
      "requestid",
      params.requestid,
    )
    .single();

  if (
    fetchError ||
    !editRequest
  ) {
    return NextResponse.json(
      {
        error:
          "Edit request not found.",
      },
      {
        status: 404,
      },
    );
  }

  if (
    editRequest.status !==
    "Pending"
  ) {
    return NextResponse.json(
      {
        error:
          "This request has already been decided.",
      },
      {
        status: 400,
      },
    );
  }

  /*
   * Maker-checker separation.
   */
  if (
    editRequest
      .requestedbyuserid ===
    viewer.userId
  ) {
    return NextResponse.json(
      {
        error:
          "You cannot decide on your own request.",
      },
      {
        status: 400,
      },
    );
  }

  /*
   * Never apply staff access changes through the
   * generic record-edit workflow.
   *
   * This also blocks old pending user-access requests
   * that might already exist in the database.
   */
  const entityType:
    unknown =
      editRequest.entitytype;

  if (
    entityType ===
    "user"
  ) {
    return NextResponse.json(
      {
        error:
          "User access changes are protected. Use User Management as a Super User instead.",
      },
      {
        status: 403,
      },
    );
  }

  if (
    !isEditRequestEntityType(
      entityType,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "This update request targets a protected or unsupported record type.",
      },
      {
        status: 400,
      },
    );
  }

  /*
   * Department-specific authorization.
   */
  if (
    !canDecideEditRequest(
      viewer,
      entityType,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Your role and department are not authorized to decide this type of update request.",
      },
      {
        status: 403,
      },
    );
  }

  const allowedFields =
    EDITABLE_FIELDS[
      entityType
    ];

  const table =
    TABLE_NAME[
      entityType
    ];

  const idColumn =
    ID_COLUMN[
      entityType
    ];

  const changes =
    editRequest.changes;

  /*
   * Revalidate the stored request at approval time.
   *
   * This protects against legacy rows or manipulated
   * records containing fields that should not be
   * writable.
   */
  if (
    !changes ||
    typeof changes !==
      "object" ||
    Array.isArray(
      changes,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "This update request contains invalid change data.",
      },
      {
        status: 400,
      },
    );
  }

  const invalidFields =
    Object.keys(
      changes,
    ).filter(
      (field) =>
        !allowedFields.includes(
          field,
        ),
    );

  if (
    invalidFields.length
  ) {
    return NextResponse.json(
      {
        error:
          `This request contains protected fields: ${invalidFields.join(
            ", ",
          )}`,
      },
      {
        status: 400,
      },
    );
  }

  if (
    status ===
    "Approved"
  ) {
    const {
      error:
        applyError,
    } = await admin
      .from(table)
      .update(changes)
      .eq(
        idColumn,
        editRequest.entityid,
      );

    if (applyError) {
      return NextResponse.json(
        {
          error:
            `Approved, but failed to apply: ${applyError.message}`,
        },
        {
          status: 500,
        },
      );
    }
  }

  const {
    error,
  } = await admin
    .from(
      "recordeditrequests",
    )
    .update({
      status,

      reviewedbyuserid:
        viewer.userId,

      reviewcomments:
        reviewComments ||
        null,

      reviewedat:
        new Date()
          .toISOString(),
    })
    .eq(
      "requestid",
      params.requestid,
    )
    .eq(
      "status",
      "Pending",
    );

  if (error) {
    return NextResponse.json(
      {
        error:
          error.message,
      },
      {
        status: 400,
      },
    );
  }

  return NextResponse.json({
    ok: true,
  });
}