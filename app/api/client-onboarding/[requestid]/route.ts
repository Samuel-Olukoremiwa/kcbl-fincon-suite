import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/viewer";
import {
  canReviewClientOnboarding,
} from "@/lib/access";
import {
  createApprovedClient,
  normalizeClientOnboardingPayload,
} from "@/lib/client-onboarding";

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
  const viewer = await requireStaff();

  if (
    !canReviewClientOnboarding(
      viewer,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Only a Business Development Authorizer or Super User may decide client onboarding requests.",
      },
      {
        status: 403,
      },
    );
  }

  let body:
    Record<
      string,
      unknown
    >;

  try {
    body =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid request body.",
      },
      {
        status: 400,
      },
    );
  }

  const decision =
    String(
      body.decision ??
        "",
    ).trim();

  const comments =
    String(
      body.comments ??
        "",
    ).trim();

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
          "Decision must be Approved or Rejected.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    decision ===
      "Rejected" &&
    !comments
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

  const admin =
    createAdminClient();

  const {
    data:
      onboardingRequest,
    error:
      fetchError,
  } = await admin
    .from(
      "clientonboardingrequests",
    )
    .select(
      "requestid,requestpayload,status,requestedbyuserid,requestedat",
    )
    .eq(
      "requestid",
      params.requestid,
    )
    .maybeSingle();

  if (
    fetchError ||
    !onboardingRequest
  ) {
    return NextResponse.json(
      {
        error:
          fetchError?.message ??
          "Client onboarding request not found.",
      },
      {
        status: 404,
      },
    );
  }

  if (
    onboardingRequest.status !==
    "Pending"
  ) {
    return NextResponse.json(
      {
        error:
          "This client onboarding request has already been decided.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    onboardingRequest
      .requestedbyuserid ===
    viewer.userId
  ) {
    return NextResponse.json(
      {
        error:
          "You cannot approve or reject your own client onboarding request.",
      },
      {
        status: 403,
      },
    );
  }

  if (
    decision ===
    "Rejected"
  ) {
    const {
      error:
        rejectError,
    } = await admin
      .from(
        "clientonboardingrequests",
      )
      .update({
        status:
          "Rejected",
        reviewedbyuserid:
          viewer.userId,
        reviewedat:
          new Date()
            .toISOString(),
        reviewcomments:
          comments,
      })
      .eq(
        "requestid",
        params.requestid,
      )
      .eq(
        "status",
        "Pending",
      );

    if (
      rejectError
    ) {
      return NextResponse.json(
        {
          error:
            rejectError.message,
        },
        {
          status: 400,
        },
      );
    }

    return NextResponse.json({
      ok: true,
      status:
        "Rejected",
      message:
        "Client onboarding request rejected.",
    });
  }

  const payload =
    normalizeClientOnboardingPayload(
      (
        onboardingRequest
          .requestpayload ??
        {}
      ) as Record<
        string,
        unknown
      >,
    );

  const result =
    await createApprovedClient({
      payload,
      request,
      recordCreatedByUserId:
        onboardingRequest
          .requestedbyuserid,
      actionByUserId:
        viewer.userId,
      auditComment:
        `Approved client onboarding request ${onboardingRequest.requestid} submitted by ${onboardingRequest.requestedbyuserid}.`,
    });

  if (
    !result.ok
  ) {
    return NextResponse.json(
      {
        error:
          result.error,
      },
      {
        status:
          result.status,
      },
    );
  }

  const {
    error:
      approveError,
  } = await admin
    .from(
      "clientonboardingrequests",
    )
    .update({
      status:
        "Approved",
      reviewedbyuserid:
        viewer.userId,
      reviewedat:
        new Date()
          .toISOString(),
      reviewcomments:
        comments ||
        null,
      approvedclientid:
        result.clientid,
    })
    .eq(
      "requestid",
      params.requestid,
    )
    .eq(
      "status",
      "Pending",
    );

  if (
    approveError
  ) {
    console.error(
      "Client created but onboarding request could not be marked Approved:",
      approveError,
    );

    return NextResponse.json(
      {
        ok: true,
        status:
          "Approved",
        clientid:
          result.clientid,
        emailSent:
          result.emailSent,
        emailError:
          result.emailError,
        warning:
          "The client was created, but the onboarding request status could not be updated automatically. An administrator should review the request row.",
      },
      {
        status: 207,
      },
    );
  }

  return NextResponse.json({
    ok: true,
    status:
      "Approved",
    clientid:
      result.clientid,
    emailSent:
      result.emailSent,
    emailError:
      result.emailError,
    message:
      result.emailSent
        ? `Client onboarding approved. ${result.clientid} was created and the Client Portal details were sent.`
        : `Client onboarding approved and ${result.clientid} was created, but the Client Portal email could not be sent.`,
  });
}
