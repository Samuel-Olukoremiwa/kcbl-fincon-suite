"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type RequestPayload = {
  type?: string;
  name?: string;
  phone?: string;
  email?: string;
  address?: string;

  idType?: string;
  idNumber?: string;
  issuer?: string;
  expiry?: string;

  rcNumber?: string;
  business?: string;
  directorName?: string;
  directorPosition?: string;
  directorDate?: string;

  ownerName?: string;
  ownership?: string;
  ownerContact?: string;

  payment?: string;
  source?: string;
  supportingDoc?: string;

  declaration?: string;
  declarationDate?: string;

  risk?: string;
  riskComments?: string;
};

type OnboardingRequest = {
  requestid: number;
  requestpayload: RequestPayload;
  status: string;
  requestedbyuserid: string;
  requestedat: string;
  requestedByName: string;
};

function value(
  input:
    | string
    | null
    | undefined,
) {
  return input?.trim() || "—";
}

function dateTime(
  input: string,
) {
  return new Date(
    input,
  ).toLocaleString(
    "en-NG",
  );
}

export default function ClientOnboardingQueue({
  requests,
  canReview,
}: {
  requests: OnboardingRequest[];
  canReview: boolean;
}) {
  const router =
    useRouter();

  const [
    busyId,
    setBusyId,
  ] =
    useState<
      number | null
    >(null);

  const [
    messages,
    setMessages,
  ] =
    useState<
      Record<
        number,
        string
      >
    >({});

  const [
    rejectionReasons,
    setRejectionReasons,
  ] =
    useState<
      Record<
        number,
        string
      >
    >({});

  async function decide(
    requestid: number,
    decision:
      | "Approved"
      | "Rejected",
  ) {
    const comments =
      rejectionReasons[
        requestid
      ] ?? "";

    if (
      decision ===
        "Rejected" &&
      !comments.trim()
    ) {
      setMessages(
        (
          current,
        ) => ({
          ...current,
          [requestid]:
            "Enter a rejection reason.",
        }),
      );

      return;
    }

    setBusyId(
      requestid,
    );

    setMessages(
      (
        current,
      ) => ({
        ...current,
        [requestid]:
          "",
      }),
    );

    try {
      const response =
        await fetch(
          `/api/client-onboarding/${requestid}`,
          {
            method:
              "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                {
                  decision,
                  comments:
                    comments.trim(),
                },
              ),
          },
        );

      const result =
        await response.json();

      if (
        !response.ok &&
        response.status !==
          207
      ) {
        setMessages(
          (
            current,
          ) => ({
            ...current,
            [requestid]:
              result.error ??
              "Could not decide this onboarding request.",
          }),
        );

        return;
      }

      const message =
        result.warning ??
        result.message ??
        (
          decision ===
          "Approved"
            ? "Client onboarding approved."
            : "Client onboarding rejected."
        );

      setMessages(
        (
          current,
        ) => ({
          ...current,
          [requestid]:
            message,
        }),
      );

      router.refresh();
    } catch (
      error
    ) {
      setMessages(
        (
          current,
        ) => ({
          ...current,
          [requestid]:
            error instanceof
            Error
              ? error.message
              : "Could not connect to the server.",
        }),
      );
    } finally {
      setBusyId(
        null,
      );
    }
  }

  return (
    <section className="card mt-6 overflow-hidden">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="font-semibold text-ink">
          Pending client onboarding
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          {canReview
            ? "Review Business Development Initiator submissions before a client record or Client Portal account is created."
            : "Your submitted onboarding requests remain here while awaiting Business Development Authorizer review."}
        </p>
      </div>

      <div className="divide-y divide-slate-100">
        {requests.map(
          (
            request,
          ) => {
            const payload =
              request.requestpayload ??
              {};

            const corporate =
              payload.type ===
              "Corporate";

            const individual =
              payload.type ===
              "Individual";

            return (
              <article
                key={
                  request.requestid
                }
                className="p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-ink">
                      {value(
                        payload.name,
                      )}
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      Request #
                      {
                        request.requestid
                      }{" "}
                      ·{" "}
                      {
                        value(
                          payload.type,
                        )
                      }{" "}
                      · submitted by{" "}
                      {
                        request.requestedByName
                      }{" "}
                      ·{" "}
                      {
                        dateTime(
                          request.requestedat,
                        )
                      }
                    </p>
                  </div>

                  <span className="badge-warning">
                    Pending
                  </span>
                </div>

                <div className="mt-4 grid gap-3 rounded-md bg-slate-50 p-4 text-sm md:grid-cols-2 xl:grid-cols-4">
                  <Detail
                    label="Email"
                    value={
                      payload.email
                    }
                  />

                  <Detail
                    label="Phone"
                    value={
                      payload.phone
                    }
                  />

                  <Detail
                    label="Address"
                    value={
                      payload.address
                    }
                  />

                  <Detail
                    label="Payment method"
                    value={
                      payload.payment
                    }
                  />

                  {individual && (
                    <>
                      <Detail
                        label="ID type"
                        value={
                          payload.idType
                        }
                      />

                      <Detail
                        label="ID number"
                        value={
                          payload.idNumber
                        }
                      />

                      <Detail
                        label="Issuing authority"
                        value={
                          payload.issuer
                        }
                      />

                      <Detail
                        label="ID expiry"
                        value={
                          payload.expiry
                        }
                      />
                    </>
                  )}

                  {corporate && (
                    <>
                      <Detail
                        label="RC number"
                        value={
                          payload.rcNumber
                        }
                      />

                      <Detail
                        label="Nature of business"
                        value={
                          payload.business
                        }
                      />

                      <Detail
                        label="Director / signatory"
                        value={
                          payload.directorName
                        }
                      />

                      <Detail
                        label="Position"
                        value={
                          payload.directorPosition
                        }
                      />

                      <Detail
                        label="Beneficial owner"
                        value={
                          payload.ownerName
                        }
                      />

                      <Detail
                        label="Ownership %"
                        value={
                          payload.ownership
                        }
                      />
                    </>
                  )}

                  <Detail
                    label="Source of funds"
                    value={
                      payload.source
                    }
                  />

                  <Detail
                    label="Supporting document"
                    value={
                      payload.supportingDoc
                    }
                  />

                  <Detail
                    label="Declaration"
                    value={
                      payload.declaration
                    }
                  />

                  <Detail
                    label="Risk"
                    value={
                      payload.risk
                    }
                  />
                </div>

                {payload.riskComments && (
                  <p className="mt-3 text-sm text-slate-600">
                    <b>
                      Risk comments:
                    </b>{" "}
                    {
                      payload.riskComments
                    }
                  </p>
                )}

                {canReview && (
                  <div className="mt-4 rounded-md border border-slate-200 p-4">
                    <label className="field-label">
                      Review / rejection comments
                    </label>

                    <textarea
                      className="field-input"
                      rows={2}
                      value={
                        rejectionReasons[
                          request.requestid
                        ] ?? ""
                      }
                      onChange={(
                        event,
                      ) =>
                        setRejectionReasons(
                          (
                            current,
                          ) => ({
                            ...current,
                            [request.requestid]:
                              event
                                .target
                                .value,
                          }),
                        )
                      }
                      placeholder="Required when rejecting; optional when approving"
                    />

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={
                          busyId ===
                          request.requestid
                        }
                        onClick={() =>
                          decide(
                            request.requestid,
                            "Approved",
                          )
                        }
                      >
                        {busyId ===
                        request.requestid
                          ? "Processing…"
                          : "Approve client"}
                      </button>

                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={
                          busyId ===
                          request.requestid
                        }
                        onClick={() =>
                          decide(
                            request.requestid,
                            "Rejected",
                          )
                        }
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                )}

                {messages[
                  request.requestid
                ] && (
                  <p className="mt-3 text-sm text-navy">
                    {
                      messages[
                        request.requestid
                      ]
                    }
                  </p>
                )}
              </article>
            );
          },
        )}

        {!requests.length && (
          <p className="p-8 text-center text-sm text-slate-400">
            No pending client onboarding requests.
          </p>
        )}
      </div>
    </section>
  );
}

function Detail({
  label,
  value: detailValue,
}: {
  label: string;
  value?:
    | string
    | null;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-1 text-slate-700">
        {value(
          detailValue,
        )}
      </p>
    </div>
  );
}
