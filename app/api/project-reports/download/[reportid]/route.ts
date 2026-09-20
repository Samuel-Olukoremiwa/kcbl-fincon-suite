import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  canReadProjectReport,
  REPORT_BUCKET,
} from "@/lib/project-reports";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: { reportid: string };
  },
) {
  const viewer = await getViewer();
  const admin = createAdminClient();

  const {
    data: report,
  } = await admin
    .from("projectreports")
    .select(
      "projectid,storagepath,reviewstatus",
    )
    .eq(
      "reportid",
      params.reportid,
    )
    .maybeSingle();

  if (!report) {
    return NextResponse.json(
      {
        error: "Report not found.",
      },
      { status: 404 },
    );
  }

  const canRead =
    await canReadProjectReport(
      viewer,
      report.projectid,
    );

  if (!canRead) {
    return NextResponse.json(
      {
        error: "Report not found.",
      },
      { status: 404 },
    );
  }

  const {
    data,
    error,
  } = await admin.storage
    .from(REPORT_BUCKET)
    .createSignedUrl(
      report.storagepath,
      60,
    );

  if (error || !data) {
    return NextResponse.json(
      {
        error:
          error?.message ??
          "Unable to open report.",
      },
      { status: 500 },
    );
  }

  return NextResponse.redirect(
    data.signedUrl,
  );
}