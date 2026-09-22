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
      userid: string;
      documentid: string;
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

  const admin =
    createAdminClient();

  const {
    data: document,
  } = await admin
    .from(
      "staffdocuments",
    )
    .select(
      "storagepath,documenttype",
    )
    .eq(
      "documentid",
      params.documentid,
    )
    .eq(
      "userid",
      params.userid,
    )
    .maybeSingle();

  if (!document) {
    return NextResponse.json(
      {
        error:
          "Document not found.",
      },
      {
        status: 404,
      },
    );
  }

  if (
    document.documenttype ===
      "Medical Result" &&
    !canViewSensitiveStaffData(
      viewer,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Document not found.",
      },
      {
        status: 404,
      },
    );
  }

  const {
    data,
    error,
  } = await admin.storage
    .from(
      STAFF_DOCUMENT_BUCKET,
    )
    .createSignedUrl(
      document.storagepath,
      60,
    );

  if (
    error ||
    !data
  ) {
    return NextResponse.json(
      {
        error:
          error?.message ??
          "Could not open the document.",
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.redirect(
    data.signedUrl,
  );
}

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: {
      userid: string;
      documentid: string;
    };
  },
) {
  const viewer =
    await requireStaff();

  if (
    !canVerifyStaffOnboarding(
      viewer,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Only an MD Office Authorizer or Super User may verify documents.",
      },
      {
        status: 403,
      },
    );
  }

  const {
    verified,
    remarks,
  } =
    await request.json();

  const admin =
    createAdminClient();

  const {
    error,
  } = await admin
    .from(
      "staffdocuments",
    )
    .update({
      verified:
        Boolean(
          verified,
        ),

      verifiedbyuserid:
        verified
          ? viewer.userId
          : null,

      verifiedat:
        verified
          ? new Date().toISOString()
          : null,

      verificationremarks:
        typeof remarks ===
          "string" &&
        remarks.trim()
          ? remarks.trim()
          : null,
    })
    .eq(
      "documentid",
      params.documentid,
    )
    .eq(
      "userid",
      params.userid,
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