import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/viewer";
import {
  canDirectCreateClient,
  canSubmitClientOnboarding,
} from "@/lib/access";
import {
  createApprovedClient,
  normalizeClientOnboardingPayload,
  validateClientOnboardingPayload,
} from "@/lib/client-onboarding";

export async function POST(
  request: Request,
) {
  const viewer = await requireStaff();

  let body: Record<string, unknown>;

  try {
    body = await request.json();
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

  const payload =
    normalizeClientOnboardingPayload(
      body,
    );

  const validationError =
    validateClientOnboardingPayload(
      payload,
    );

  if (
    validationError
  ) {
    return NextResponse.json(
      {
        error:
          validationError,
      },
      {
        status: 400,
      },
    );
  }

  /*
   * Business Development uses Maker-Checker:
   *
   * Initiator -> Pending onboarding request
   * Authorizer -> review/approve/reject
   *
   * No client record, Supabase Auth user, or welcome email
   * is created until approval.
   */
  if (
    canSubmitClientOnboarding(
      viewer,
    )
  ) {
    const admin =
      createAdminClient();

    const {
      data,
      error,
    } = await admin
      .from(
        "clientonboardingrequests",
      )
      .insert({
        requestpayload:
          payload,
        requestedbyuserid:
          viewer.userId,
        status:
          "Pending",
      })
      .select(
        "requestid",
      )
      .single();

    if (
      error ||
      !data
    ) {
      if (
        error?.code ===
        "23505"
      ) {
        return NextResponse.json(
          {
            error:
              "A pending client onboarding request already exists for this email address.",
          },
          {
            status: 409,
          },
        );
      }

      return NextResponse.json(
        {
          error:
            error?.message ??
            "Could not submit the client onboarding request.",
        },
        {
          status: 400,
        },
      );
    }

    return NextResponse.json(
      {
        pending:
          true,
        requestid:
          data.requestid,
        message:
          "Client onboarding submitted for Business Development Authorizer review.",
      },
      {
        status: 201,
      },
    );
  }

  /*
   * Preserve the existing administrative direct-create path
   * for Super User and MD Office.
   */
  if (
    canDirectCreateClient(
      viewer,
    )
  ) {
    const result =
      await createApprovedClient({
        payload,
        request,
        recordCreatedByUserId:
          viewer.userId,
        actionByUserId:
          viewer.userId,
        auditComment:
          `${payload.name} · direct administrative onboarding`,
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

    return NextResponse.json(
      {
        clientid:
          result.clientid,
        userId:
          result.userId,
        emailSent:
          result.emailSent,
        emailError:
          result.emailError,
        pending:
          false,
        message:
          result.emailSent
            ? result.createdAuthUser
              ? "Client created and temporary Client Portal login details sent."
              : "Client created and linked Client Portal account notified."
            : "Client created, but the Client Portal email could not be sent. The user can use Forgot Password from the login page.",
      },
      {
        status: 201,
      },
    );
  }

  return NextResponse.json(
    {
      error:
        viewer.department ===
          "Business Development" &&
        viewer.roleName ===
          "Authorizer"
          ? "Business Development Authorizers cannot onboard new clients. Review submitted onboarding requests instead."
          : "You are not authorized to onboard clients.",
    },
    {
      status: 403,
    },
  );
}
