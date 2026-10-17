import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  MAX_MEDIA_FILES,
  MAX_MEDIA_TOTAL_BYTES,
  MEDIA_BUCKET,
  mediaTypeForMime,
  validMediaUpload,
} from "@/lib/project-reports";

export async function POST(
  request: Request,
) {
  const viewer = await getViewer();

  if (
    viewer.userType !== "Staff" ||
    viewer.department !== "Operations"
  ) {
    return NextResponse.json(
      {
        error:
          "Only the report uploader may add report media.",
      },
      { status: 403 },
    );
  }

  const {
    reportid,
    filename,
    filesize,
    mimetype,
  } = await request.json();

  if (
    !reportid ||
    typeof filename !==
      "string" ||
    !validMediaUpload({
      mimetype,
      filesize,
    })
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid media file. Images must be JPG/PNG/WebP up to 5 MB; videos must be MP4/WebM up to 25 MB.",
      },
      { status: 400 },
    );
  }

  const admin =
    createAdminClient();

  const {
    data: report,
  } = await admin
    .from("projectreports")
    .select(
      "reportid,uploadedbyuserid,reviewstatus",
    )
    .eq(
      "reportid",
      reportid,
    )
    .maybeSingle();

  if (
    !report ||
    report.uploadedbyuserid !==
      viewer.userId ||
    report.reviewstatus !==
      "Submitted"
  ) {
    return NextResponse.json(
      {
        error:
          "Media may only be added by the uploader while the report is still awaiting review.",
      },
      { status: 403 },
    );
  }

  const {
    data: existing,
    error: existingError,
  } = await admin
    .from(
      "projectreportmedia",
    )
    .select("filesize")
    .eq(
      "reportid",
      reportid,
    );

  if (existingError) {
    return NextResponse.json(
      {
        error:
          existingError.message,
      },
      { status: 500 },
    );
  }

  if (
    (existing ?? []).length >=
    MAX_MEDIA_FILES
  ) {
    return NextResponse.json(
      {
        error:
          "A report may contain a maximum of 6 media files.",
      },
      { status: 400 },
    );
  }

  const existingBytes =
    (existing ?? []).reduce(
      (
        total,
        item,
      ) =>
        total +
        Number(
          item.filesize,
        ),
      0,
    );

  if (
    existingBytes +
      Number(filesize) >
    MAX_MEDIA_TOTAL_BYTES
  ) {
    return NextResponse.json(
      {
        error:
          "Combined report media may not exceed 50 MB.",
      },
      { status: 400 },
    );
  }

  const mediaType =
    mediaTypeForMime(
      mimetype,
    );

  if (!mediaType) {
    return NextResponse.json(
      {
        error:
          "Unsupported media type.",
      },
      { status: 400 },
    );
  }

  const safeName =
    filename.replace(
      /[^a-zA-Z0-9._-]/g,
      "_",
    );

  const storagepath =
    `${reportid}/${crypto.randomUUID()}-${safeName}`;

  const {
    data,
    error,
  } = await admin.storage
    .from(MEDIA_BUCKET)
    .createSignedUploadUrl(
      storagepath,
    );

  if (error) {
    return NextResponse.json(
      {
        error:
          error.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    storagepath,
    token: data.token,
    mediatype:
      mediaType,
  });
}
