"use client";

import {
  useEffect,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import type {
  EditRequestEntityType,
} from "@/lib/access";

type Request = {
  requestid: number;

  entitytype:
    EditRequestEntityType;

  entityid: string;

  changes:
    Record<
      string,
      unknown
    >;

  previousvalues:
    Record<
      string,
      unknown
    >;

  requestedbyuserid:
    string;

  status: string;
};

export default function EditRequestsClient({
  viewer,
}: {
  viewer: {
    userId: string;

    canDecideByType:
      Record<
        EditRequestEntityType,
        boolean
      >;
  };
}) {
  const router =
    useRouter();

  const [
    requests,
    setRequests,
  ] =
    useState<
      Request[]
    >([]);

  const [
    reason,
    setReason,
  ] =
    useState<
      Record<
        number,
        string
      >
    >({});

  const [
    msg,
    setMsg,
  ] =
    useState<
      string | null
    >(null);

  async function load() {
    const response =
      await fetch(
        "/api/edit-requests?status=Pending",
        {
          cache:
            "no-store",
        },
      );

    const result =
      await response.json();

    if (
      response.ok
    ) {
      setRequests(
        result.requests ??
          [],
      );
    } else {
      setMsg(
        result.error ??
          "Could not load update requests.",
      );
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function decide(
    requestid: number,

    status:
      | "Approved"
      | "Rejected",
  ) {
    if (
      status ===
        "Rejected" &&
      !reason[
        requestid
      ]?.trim()
    ) {
      setMsg(
        "A rejection reason is required.",
      );

      return;
    }

    setMsg(null);

    const response =
      await fetch(
        `/api/edit-requests/${requestid}`,
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
                status,

                comments:
                  reason[
                    requestid
                  ]?.trim() ||
                  null,
              },
            ),
        },
      );

    const result =
      await response.json();

    if (
      !response.ok
    ) {
      setMsg(
        result.error ??
          "Could not process the update request.",
      );

      return;
    }

    setReason(
      (current) => ({
        ...current,

        [requestid]:
          "",
      }),
    );

    await load();

    router.refresh();
  }

  return (
    <div className="card mt-8 overflow-hidden">
      {msg && (
        <p className="p-4 text-sm text-red-600">
          {msg}
        </p>
      )}

      <div className="divide-y">
        {requests.map(
          (
            request,
          ) => {
            const canDecide =
              viewer
                .canDecideByType[
                request
                  .entitytype
              ] === true;

            const isOwnRequest =
              request
                .requestedbyuserid ===
              viewer.userId;

            return (
              <div
                key={
                  request.requestid
                }
                className="p-5"
              >
                <b>
                  {request.entitytype.toUpperCase()}
                  {" · "}
                  {request.entityid}
                </b>

                <p className="mt-1 text-sm text-slate-500">
                  Requested by{" "}
                  {
                    request.requestedbyuserid
                  }
                </p>

                <div className="mt-3 grid gap-1 text-sm">
                  {Object.entries(
                    request.changes,
                  ).map(
                    ([
                      field,
                      value,
                    ]) => (
                      <p
                        key={
                          field
                        }
                      >
                        <span className="text-slate-500">
                          {
                            field
                          }
                          :
                        </span>{" "}

                        <span className="text-slate-400 line-through">
                          {String(
                            request
                              .previousvalues?.[
                              field
                            ] ??
                              "—",
                          )}
                        </span>

                        {" → "}

                        <b>
                          {String(
                            value,
                          )}
                        </b>
                      </p>
                    ),
                  )}
                </div>

                {canDecide ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input
                      value={
                        reason[
                          request
                            .requestid
                        ] ?? ""
                      }
                      onChange={(
                        event,
                      ) =>
                        setReason(
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
                      placeholder="Rejection reason (required only to reject)"
                      className="field-input max-w-sm"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        decide(
                          request.requestid,
                          "Approved",
                        )
                      }
                      className="btn-primary"
                      disabled={
                        isOwnRequest
                      }
                    >
                      Approve
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        decide(
                          request.requestid,
                          "Rejected",
                        )
                      }
                      className="btn-secondary"
                      disabled={
                        isOwnRequest
                      }
                    >
                      Reject
                    </button>

                    {isOwnRequest && (
                      <span className="self-center text-xs text-slate-500">
                        Maker-checker: you cannot decide your own request.
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-slate-500">
                    View only — this request requires its designated
                    departmental Authorizer.
                  </p>
                )}
              </div>
            );
          },
        )}

        {!requests.length && (
          <p className="p-10 text-center text-slate-400">
            No pending update requests.
          </p>
        )}
      </div>
    </div>
  );
}