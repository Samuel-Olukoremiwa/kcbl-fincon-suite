import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/viewer";

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: {
      id: string;
    };
  },
) {
  const viewer =
    await getViewer();

  if (
    viewer.department !==
    "Audit/Internal Control"
  ) {
    return NextResponse.json(
      {
        error:
          "Only Audit/Internal Control can approve this request.",
      },
      {
        status: 403,
      },
    );
  }

  const {
    decision,
    comments,
  } =
    await request.json();

  if (
    ![
      "Approved",
      "Rejected",
    ].includes(
      decision,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid decision.",
      },
      {
        status: 400,
      },
    );
  }

  const admin =
    createAdminClient();

  const {
    data: row,
    error: fetchError,
  } =
    await admin
      .from(
        "sessiontimeoutrequests",
      )
      .select(
        "requestedminutes",
      )
      .eq(
        "requestid",
        params.id,
      )
      .eq(
        "status",
        "Pending",
      )
      .single();

  if (
    fetchError ||
    !row
  ) {
    return NextResponse.json(
      {
        error:
          "Request not found.",
      },
      {
        status: 404,
      },
    );
  }

  const {
    error,
  } =
    await admin
      .from(
        "sessiontimeoutrequests",
      )
      .update({
        status:
          decision,

        reviewedbyuserid:
          viewer.userId,

        reviewcomments:
          comments ||
          null,

        reviewedat:
          new Date().toISOString(),
      })
      .eq(
        "requestid",
        params.id,
      );

  if (error) {
    return NextResponse.json(
      {
        error:
          error.message,
      },
      {
        status: 500,
      },
    );
  }

  if (
    decision ===
    "Approved"
  ) {
    await admin
      .from(
        "systemsettings",
      )
      .upsert({
        settingkey:
          "session_timeout_minutes",

        settingvalue:
          row.requestedminutes,

        updatedbyuserid:
          viewer.userId,

        updatedat:
          new Date().toISOString(),
      });
  }

  return NextResponse.json({
    ok: true,
  });
}