import { NextResponse } from "next/server";

import {
  canAccess,
  canSubmitEditRequest,
  type EditRequestEntityType,
} from "@/lib/access";

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

export async function GET(
  request: Request,
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
          "You are not authorized to view update requests.",
      },
      {
        status: 403,
      },
    );
  }

  const {
    searchParams,
  } = new URL(
    request.url,
  );

  const status =
    searchParams.get(
      "status",
    ) ?? "Pending";

  const supabase =
    createClient();

  const {
    data,
    error,
  } = await supabase
    .from(
      "recordeditrequests",
    )
    .select("*")
    .eq(
      "status",
      status,
    )
    .in(
      "entitytype",
      GENERIC_EDIT_ENTITY_TYPES,
    )
    .order(
      "requestedat",
      {
        ascending: false,
      },
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
    requests:
      data ?? [],
  });
}

export async function POST(
  request: Request,
) {
  const viewer =
    await requireStaff();

  const {
    entitytype,
    entityid,
    changes,
  } =
    await request.json();

  /*
   * Staff access changes must NEVER pass through
   * this generic update-request workflow.
   *
   * Role, department and derived access level are
   * controlled only by:
   *
   * /api/users/update-access
   *
   * which is Super User-only.
   */
  if (
    entitytype ===
    "user"
  ) {
    return NextResponse.json(
      {
        error:
          "Staff role and department changes can only be made by a Super User from User Management.",
      },
      {
        status: 403,
      },
    );
  }

  if (
    !isEditRequestEntityType(
      entitytype,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Unknown or protected record type.",
      },
      {
        status: 400,
      },
    );
  }

  /*
   * A department cannot manually submit an update
   * for a record type outside its own module scope.
   */
  if (
    !canSubmitEditRequest(
      viewer,
      entitytype,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Your department is not authorized to submit updates for this record type.",
      },
      {
        status: 403,
      },
    );
  }

  if (!entityid) {
    return NextResponse.json(
      {
        error:
          "Record ID is required.",
      },
      {
        status: 400,
      },
    );
  }

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
          "Changes must be provided as an object.",
      },
      {
        status: 400,
      },
    );
  }

  const allowed =
    EDITABLE_FIELDS[
      entitytype
    ];

  const submittedFields =
    Object.keys(
      changes,
    );

  const invalid =
    submittedFields.filter(
      (field) =>
        !allowed.includes(
          field,
        ),
    );

  if (
    invalid.length
  ) {
    return NextResponse.json(
      {
        error:
          `These fields cannot be edited this way: ${invalid.join(
            ", ",
          )}`,
      },
      {
        status: 400,
      },
    );
  }

  if (
    !submittedFields.length
  ) {
    return NextResponse.json(
      {
        error:
          "No changes provided.",
      },
      {
        status: 400,
      },
    );
  }

  const supabase =
    createClient();

  const table =
    TABLE_NAME[
      entitytype
    ];

  const idColumn =
    ID_COLUMN[
      entitytype
    ];

  const {
    data: current,
    error:
      fetchError,
  } = await supabase
    .from(table)
    .select(
      allowed.join(","),
    )
    .eq(
      idColumn,
      entityid,
    )
    .single();

  if (
    fetchError ||
    !current
  ) {
    return NextResponse.json(
      {
        error:
          "Record not found.",
      },
      {
        status: 404,
      },
    );
  }

  const {
    error,
  } =
    await supabase
      .from(
        "recordeditrequests",
      )
      .insert({
        entitytype,
        entityid,
        changes,
        previousvalues:
          current,
        requestedbyuserid:
          viewer.userId,
      });

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

  return NextResponse.json(
    {
      ok: true,
    },
    {
      status: 201,
    },
  );
}