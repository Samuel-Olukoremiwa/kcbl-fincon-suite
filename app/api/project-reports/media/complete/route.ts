import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import {
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
          "Only the report uploader may complete a report media upload.",
      },
      { status: 403 },
    );
  }

  const {
    reportid,
    filename,
    filesize,
    mimetype,
    storagepath,
  } = await request.json();

  if (
    !reportid ||
    typeof filename !==
      "string" ||
    typeof storagepath !==
      "string" ||
    !storagepath.startsWith(
      `${reportid}/`,
    ) ||
    !validMediaUpload({
      mimetype,
      filesize,
    })
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid media upload details.",
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
    await admin.storage
      .from(MEDIA_BUCKET)
      .remove([
        storagepath,
      ]);

    return NextResponse.json(
      {
        error:
          "Media may only be added by the uploader while the report is still awaiting review.",
      },
      { status: 403 },
    );
  }

  const mediaType =
    mediaTypeForMime(
      mimetype,
    );

  if (!mediaType) {
    await admin.storage
      .from(MEDIA_BUCKET)
      .remove([
        storagepath,
      ]);

    return NextResponse.json(
      {
        error:
          "Unsupported media type.",
      },
      { status: 400 },
    );
  }

  const {
    data: media,
    error,
  } = await admin
    .from(
      "projectreportmedia",
    )
    .insert({
      reportid,
      filename,
      storagepath,
      filesize,
      mimetype,
      mediatype:
        mediaType,
    })
    .select("mediaid")
    .single();

  if (error) {
    await admin.storage
      .from(MEDIA_BUCKET)
      .remove([
        storagepath,
      ]);

    return NextResponse.json(
      {
        error:
          error.message,
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      mediaid:
        media.mediaid,
    },
    { status: 201 },
  );
}
