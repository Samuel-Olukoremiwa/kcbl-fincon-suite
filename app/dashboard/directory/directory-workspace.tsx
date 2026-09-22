"use client";

import { useMemo, useState } from "react";
import { date, money } from "@/lib/client-utils";

type Item = any;

function weekLabel(value: string) {
  const start = new Date(`${value}T00:00:00`);

  return start.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
  });
}

export default function DirectoryWorkspace({
  clients,
  projects,
  managerNames,
  inflows,
  outflows,
  progress,
  canViewFinancial,
}: {
  clients: Item[];
  projects: Item[];
  managerNames: Record<string, string>;
  inflows: Record<string, number>;
  outflows: Record<string, number>;
  progress: Record<
    string,
    {
      pct: number;
      week: string;
    }
  >;
  canViewFinancial: boolean;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] =
    useState("All statuses");
  const [type, setType] =
    useState("All client types");

  const statuses = [
    "Ongoing",
    "Completed",
    "On Hold",
    "Pending",
  ];

  const visibleClients = useMemo(
    () =>
      clients.filter((client) => {
        const projectsForClient =
          projects.filter(
            (project) =>
              project.clientid ===
              client.clientid,
          );

        const matchesQuery =
          `${client.clientid} ${client.fullnameorcompanyname} ${client.email} ${projectsForClient
            .map(
              (p) =>
                `${p.projectid} ${p.projecttitle}`,
            )
            .join(" ")}`
            .toLowerCase()
            .includes(
              query.toLowerCase(),
            );

        return (
          matchesQuery &&
          (type ===
            "All client types" ||
            client.clienttype ===
              type) &&
          (status ===
            "All statuses" ||
            projectsForClient.some(
              (project) =>
                project.status ===
                status,
            ))
        );
      }),
    [
      clients,
      projects,
      query,
      status,
      type,
    ],
  );

  const types = [
    ...new Set(
      clients
        .map(
          (client) =>
            client.clienttype,
        )
        .filter(Boolean),
    ),
  ];

  return (
    <>
      <div className="card mt-8 flex flex-wrap gap-3 p-4">
        <input
          aria-label="Search clients and projects"
          className="field-input min-w-[240px] flex-1"
          value={query}
          onChange={(e) =>
            setQuery(
              e.target.value,
            )
          }
          placeholder="Search client, project name or code…"
        />

        <select
          aria-label="Filter by project status"
          className="field-input max-w-xs"
          value={status}
          onChange={(e) =>
            setStatus(
              e.target.value,
            )
          }
        >
          <option>
            All statuses
          </option>

          {statuses.map(
            (value) => (
              <option
                key={value}
              >
                {value}
              </option>
            ),
          )}
        </select>

        <select
          aria-label="Filter by client type"
          className="field-input max-w-xs"
          value={type}
          onChange={(e) =>
            setType(
              e.target.value,
            )
          }
        >
          <option>
            All client types
          </option>

          {types.map(
            (value) => (
              <option
                key={value}
              >
                {value}
              </option>
            ),
          )}
        </select>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setQuery("");
            setStatus(
              "All statuses",
            );
            setType(
              "All client types",
            );
          }}
        >
          Clear filters
        </button>
      </div>

      {!canViewFinancial && (
        <p className="mt-4 rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-600">
          Financial figures are restricted for your department.
        </p>
      )}

      <div className="mt-6 space-y-6">
        {visibleClients.map(
          (client) => {
            const clientProjects =
              projects.filter(
                (project) =>
                  project.clientid ===
                    client.clientid &&
                  (status ===
                    "All statuses" ||
                    project.status ===
                      status),
              );

            return (
              <section
                className="card overflow-hidden"
                key={
                  client.clientid
                }
              >
                <div className="grid gap-4 border-b border-slate-200 bg-slate-50 p-5 lg:grid-cols-[1.2fr_1fr_1fr]">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Client
                    </p>

                    <p className="mt-1 font-semibold text-ink">
                      {
                        client.fullnameorcompanyname
                      }
                    </p>

                    <p className="text-xs text-slate-500">
                      {
                        client.clientid
                      }{" "}
                      ·{" "}
                      {
                        client.clienttype
                      }
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Contact
                    </p>

                    <p className="mt-1 break-words text-sm text-ink">
                      {
                        client.email
                      }
                    </p>

                    <p className="text-sm text-slate-500">
                      {
                        client.phonenumber
                      }
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Payment &amp; address
                    </p>

                    <p className="mt-1 text-sm text-ink">
                      {
                        client.preferredpaymentmethod
                      }
                    </p>

                    <p className="break-words text-sm text-slate-500">
                      {
                        client.address
                      }
                    </p>
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {clientProjects.map(
                    (project) => (
                      <ProjectCard
                        key={
                          project.projectid
                        }
                        project={
                          project
                        }
                        managerName={
                          managerNames[
                            project
                              .projectmanageruserid
                          ] ??
                          "Not assigned"
                        }
                        inflow={
                          inflows[
                            project
                              .projectid
                          ] ?? 0
                        }
                        outflow={
                          outflows[
                            project
                              .projectid
                          ] ?? 0
                        }
                        progress={
                          progress[
                            project
                              .projectid
                          ] ?? null
                        }
                        canViewFinancial={
                          canViewFinancial
                        }
                      />
                    ),
                  )}
                </div>
              </section>
            );
          },
        )}

        {!visibleClients.length && (
          <div className="card p-10 text-center text-slate-400">
            No clients or projects match the selected filters.
          </div>
        )}
      </div>
    </>
  );
}

function ProjectCard({
  project,
  managerName,
  inflow,
  outflow,
  progress,
  canViewFinancial,
}: {
  project: Item;
  managerName: string;
  inflow: number;
  outflow: number;
  progress: {
    pct: number;
    week: string;
  } | null;
  canViewFinancial: boolean;
}) {
  const completed =
    project.status ===
    "Completed";

  const projectValue =
    Number(
      project.estimatedvalue ??
        0,
    );

  const inflowReceived =
    Number(inflow ?? 0);

  const expenditure =
    Number(outflow ?? 0);

  const cashPosition =
    inflowReceived -
    expenditure;

  const expectedInflow =
    projectValue -
    inflowReceived;

  return (
    <article className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold text-ink">
            {
              project.projecttitle
            }
          </p>

          <p className="mt-1 text-xs text-slate-500">
            {
              project.projectid
            }{" "}
            ·{" "}
            {
              project.projecttype
            }{" "}
            ·{" "}
            {
              project.projectlocation
            }
          </p>
        </div>

        <span className="rounded-full bg-navy-50 px-2.5 py-1 text-xs font-medium text-navy">
          {
            project.status
          }
        </span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr]">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <Detail
            label="Project value"
            value={
              canViewFinancial
                ? money(
                    project.estimatedvalue,
                  )
                : "Restricted"
            }
            restricted={
              !canViewFinancial
            }
          />

          <Detail
            label="Progress"
            value={
              progress
                ? `${progress.pct}% · Week of ${weekLabel(
                    progress.week,
                  )}`
                : "No authorized report yet"
            }
          />

          <Detail
            label="Project manager"
            value={
              managerName
            }
          />

          <Detail
            label="Start date"
            value={date(
              project.startdate,
            )}
          />

          <Detail
            label="Expected end"
            value={date(
              project.expectedenddate,
            )}
          />
        </div>

        {!canViewFinancial ? (
          <div className="rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-500">
            Financial snapshot{" "}
            <span className="ml-2 inline-block select-none rounded bg-slate-200 px-2 py-1 text-xs font-medium blur-[1px]">
              Restricted
            </span>
          </div>
        ) : completed ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
            Financial records are hidden for completed projects.
          </div>
        ) : (
          <div className="rounded-md border border-navy-100 bg-navy-50/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-navy">
              Financial snapshot — approved only
            </p>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Amount
                label="Inflow received"
                value={money(
                  inflowReceived,
                )}
                tone="text-green-700"
              />

              <Amount
                label="Expenditure"
                value={money(
                  expenditure,
                )}
                tone="text-red-700"
              />

              <Amount
                label="Cash position"
                value={money(
                  cashPosition,
                )}
                tone={
                  cashPosition <
                  0
                    ? "text-red-700"
                    : "text-navy"
                }
              />

              <Amount
                label="Expected inflow"
                value={money(
                  expectedInflow,
                )}
                tone={
                  expectedInflow <
                  0
                    ? "text-red-700"
                    : "text-navy"
                }
              />
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function Detail({
  label,
  value,
  restricted = false,
}: {
  label: string;
  value: string;
  restricted?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p
        className={`mt-1 break-words text-sm text-ink ${
          restricted
            ? "select-none blur-[1px]"
            : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Amount({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <p
        className={`table-number mt-1 text-sm font-semibold ${tone}`}
      >
        {value}
      </p>
    </div>
  );
}
