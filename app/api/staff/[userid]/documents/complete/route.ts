import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/viewer";
import {
  MAX_STAFF_DOCUMENT_BYTES,
  STAFF_DOCUMENT_MIME_TYPES,
  STAFF_DOCUMENT_TYPES,
  canEditStaffOnboarding,
} from "@/lib/staff-records";

export async function POST(
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
    !canEditStaffOnboarding(
      viewer,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "You are not authorized to save staff documents.",
      },
      {
        status: 403,
      },
    );
  }

  const {
    documenttype,
    filename,
    filesize,
    mimetype,
    storagepath,
  } =
    await request.json();

  if (
    !(
      STAFF_DOCUMENT_TYPES as readonly string[]
    ).includes(
      documenttype,
    ) ||
    typeof filename !==
      "string" ||
    !(
      STAFF_DOCUMENT_MIME_TYPES as readonly string[]
    ).includes(
      mimetype,
    ) ||
    !Number.isInteger(
      filesize,
    ) ||
    filesize < 1 ||
    filesize >
      MAX_STAFF_DOCUMENT_BYTES ||
    typeof storagepath !==
      "string" ||
    !storagepath.startsWith(
      `${params.userid}/`,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid staff document details.",
      },
      {
        status: 400,
      },
    );
  }

  const admin =
    createAdminClient();

  const {
    data,
    error,
  } = await admin
    .from(
      "staffdocuments",
    )
    .insert({
      userid:
        params.userid,

      documenttype,

      filename:
        filename.trim(),

      storagepath,

      mimetype,

      filesize,

      uploadedbyuserid:
        viewer.userId,
    })
    .select(
      "documentid",
    )
    .single();

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

      documentid:
        data.documentid,
    },
    {
      status: 201,
    },
  );
}