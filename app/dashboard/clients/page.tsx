import { FileCheck2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePageAccess } from "@/lib/viewer";
import ClientWorkspace from "./client-workspace";
import ClientOnboardingQueue from "./client-onboarding-queue";
import {
  canDirectCreateClient,
  canReviewClientOnboarding,
  canSubmitClientEditRequest,
  canSubmitClientOnboarding,
} from "@/lib/access";
import PageHeader from "../page-header";

export default async function ClientsPage() {
  const viewer =
    await requirePageAccess(
      "clients",
    );

  const supabase =
    createClient();

  const admin =
    createAdminClient();

  const canSubmitOnboarding =
    canSubmitClientOnboarding(
      viewer,
    );

  const canReviewOnboarding =
    canReviewClientOnboarding(
      viewer,
    );

  const canDirectCreate =
    canDirectCreateClient(
      viewer,
    );

  const canCreate =
    canSubmitOnboarding ||
    canDirectCreate;

  const canEdit =
    canSubmitClientEditRequest(
      viewer,
    );

  const showOnboardingQueue =
    canSubmitOnboarding ||
    canReviewOnboarding;

  const [
    {
      data:
        clients,
    },
    {
      data:
        clientUsers,
    },
    {
      data:
        pendingRequests,
    },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select(
        "clientid, clienttype, fullnameorcompanyname, email, phonenumber, preferredpaymentmethod, address, idtype, idnumber, issuingauthority, idexpirydate",
      )
      .order(
        "clientid",
        {
          ascending:
            false,
        },
      ),

    canDirectCreate
      ? admin
          .from("users")
          .select(
            "userid,fullname,email,roles!inner(rolename)",
          )
          .eq(
            "roles.rolename",
            "Client",
          )
          .eq(
            "status",
            "Active",
          )
      : Promise.resolve({
          data: [],
        }),

    showOnboardingQueue
      ? (
          canReviewOnboarding
            ? admin
                .from(
                  "clientonboardingrequests",
                )
                .select(
                  "requestid,requestpayload,status,requestedbyuserid,requestedat",
                )
                .eq(
                  "status",
                  "Pending",
                )
                .order(
                  "requestedat",
                  {
                    ascending:
                      false,
                  },
                )
            : admin
                .from(
                  "clientonboardingrequests",
                )
                .select(
                  "requestid,requestpayload,status,requestedbyuserid,requestedat",
                )
                .eq(
                  "status",
                  "Pending",
                )
                .eq(
                  "requestedbyuserid",
                  viewer.userId,
                )
                .order(
                  "requestedat",
                  {
                    ascending:
                      false,
                  },
                )
        )
      : Promise.resolve({
          data: [],
        }),
  ]);

  const requestedByIds =
    Array.from(
      new Set(
        (
          pendingRequests ??
          []
        ).map(
          (
            request,
          ) =>
            request.requestedbyuserid,
        ),
      ),
    );

  const {
    data:
      requestSubmitters,
  } =
    requestedByIds.length
      ? await admin
          .from("users")
          .select(
            "userid,fullname",
          )
          .in(
            "userid",
            requestedByIds,
          )
      : {
          data: [],
        };

  const submitterNames =
    new Map(
      (
        requestSubmitters ??
        []
      ).map(
        (
          user,
        ) => [
          user.userid,
          user.fullname,
        ],
      ),
    );

  const onboardingRequests =
    (
      pendingRequests ??
      []
    ).map(
      (
        request,
      ) => ({
        ...request,

        requestedByName:
          submitterNames.get(
            request.requestedbyuserid,
          ) ??
          request.requestedbyuserid,
      }),
    );

  return (
    <div>
      <PageHeader
        icon={
          FileCheck2
        }
        title="Clients"
        description="Business Development uses Maker-Checker: Initiators submit client onboarding; Authorizers review and approve or reject."
      />

      {showOnboardingQueue && (
        <ClientOnboardingQueue
          requests={
            onboardingRequests as any
          }
          canReview={
            canReviewOnboarding
          }
        />
      )}

      <ClientWorkspace
        clients={
          clients ??
          []
        }
        currentUserId={
          viewer.userId
        }
        canCreate={
          canCreate
        }
        canEdit={
          canEdit
        }
        requiresApproval={
          canSubmitOnboarding
        }
        clientUsers={(
          clientUsers ??
          []
        ).map(
          (
            user,
          ) => ({
            userid:
              user.userid,
            fullname:
              user.fullname,
            email:
              user.email,
          }),
        )}
      />
    </div>
  );
}
