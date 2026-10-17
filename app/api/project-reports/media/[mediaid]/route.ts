import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  canReadProjectReport,
  MEDIA_BUCKET,
} from "@/lib/project-reports";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: {
      mediaid: string;
    };
  },
) {
  const viewer = await getViewer();
  const admin =
    createAdminClient();

  const {
    data: media,
  } = await admin
    .from(
      "projectreportmedia",
    )
    .select(
      `
        mediaid,
        reportid,
        filename,
        storagepath
      `,
    )
    .eq(
      "mediaid",
      params.mediaid,
    )
    .maybeSingle();

  if (!media) {
    return NextResponse.json(
      {
        error:
          "Media not found.",
      },
      { status: 404 },
    );
  }

  const {
    data: report,
  } = await admin
    .from("projectreports")
    .select(
      `
        projectid,
        uploadedbyuserid,
        reporttype,
        reviewstatus
      `,
    )
    .eq(
      "reportid",
      media.reportid,
    )
    .maybeSingle();

  if (!report) {
    return NextResponse.json(
      {
        error:
          "Media not found.",
      },
      { status: 404 },
    );
  }

  const canRead =
    await canReadProjectReport(
      viewer,
      report,
    );

  if (!canRead) {
    return NextResponse.json(
      {
        error:
          "Media not found.",
      },
      { status: 404 },
    );
  }

  const {
    data,
    error,
  } = await admin.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(
      media.storagepath,
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
          "Unable to open media.",
      },
      { status: 500 },
    );
  }

  return NextResponse.redirect(
    data.signedUrl,
  );
}
