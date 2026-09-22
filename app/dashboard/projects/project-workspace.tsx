"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ProjectForm from "./project-form";
import { date, money } from "@/lib/client-utils";

type Item = Record<string, any>;

const STATUSES = ["Ongoing", "Completed", "On Hold", "Pending"];

function weekLabel(value: string) {
  const start = new Date(`${value}T00:00:00`);

  return start.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
  });
}

function ProgressCell({
  progress,
}: {
  progress: {
    pct: number;
    week: string;
  } | null;
}) {
  if (!progress) {
    return (
      <span className="text-xs text-slate-400">
        No authorized report
      </span>
    );
  }

  return (
    <div>
      <span className="font-extrabold text-ink">
        {progress.pct}%
      </span>

      <span className="block text-xs text-slate-400">
        Week of {weekLabel(progress.week)}
      </span>
    </div>
  );
}

export default function ProjectWorkspace({
  projects,
  clients,
  managers,
  canEdit,
  canCreate,
  canViewFinancial,
}: {
  projects: Item[];
  clients: {
    clientid: string;
    fullnameorcompanyname: string;
  }[];
  managers: {
    userid: string;
    fullname: string;
  }[];
  canEdit: boolean;
  canCreate: boolean;
  canViewFinancial: boolean;
}) {
  const router = useRouter();

  const [view, setView] = useState<
    "existing" | "new"
  >("existing");

  const [status, setStatus] =
    useState("All statuses");

  const [query, setQuery] = useState("");

  const [saving, setSaving] =
    useState<string | null>(null);

  const [message, setMessage] =
    useState<string | null>(null);

  const visible = useMemo(
    () =>
      projects.filter(
        (p) =>
          (status === "All statuses" ||
            p.status === status) &&
          `${p.projectid} ${p.projecttitle} ${p.clientName}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [projects, status, query],
  );

  async function updateStatus(
    projectid: string,
    nextStatus: string,
  ) {
    setSaving(projectid);
    setMessage(null);

    const res = await fetch("/api/projects", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectid,
        status: nextStatus,
      }),
    });

    const data = await res.json();

    setSaving(null);

    if (!res.ok) {
      return setMessage(
        data.error ??
          "Could not update project status.",
      );
    }

    router.refresh();
  }

  return (
    <div className="mt-8">
      <div className="flex flex-wrap gap-3 border-b border-slate-200 pb-4">
        <button
          type="button"
          className={
            view === "existing"
              ? "btn-primary"
              : "btn-secondary"
          }
          onClick={() => setView("existing")}
        >
          Existing projects
        </button>

        {canCreate && (
          <button
            type="button"
            className={
              view === "new"
                ? "btn-primary"
                : "btn-secondary"
            }
            onClick={() => setView("new")}
          >
            Create new project
          </button>
        )}
      </div>

      {view === "new" && canCreate ? (
        <div className="card mt-6 max-w-xl p-6">
          <ProjectForm
            existingIds={projects.map(
              (p) => p.projectid,
            )}
            clients={clients}
            managers={managers}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {!canViewFinancial && (
            <p className="rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-600">
              Financial values are restricted for
              your department.
            </p>
          )}

          <div className="card flex flex-wrap gap-3 p-4">
            <input
              className="field-input max-w-sm"
              value={query}
              onChange={(e) =>
                setQuery(e.target.value)
              }
              placeholder="Search project, code or client…"
            />

            <select
              className="field-input max-w-xs"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value)
              }
            >
              <option>All statuses</option>

              {STATUSES.map((value) => (
                <option key={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          {message && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {message}
            </p>
          )}

          {clients.map((client) => {
            const rows = visible.filter(
              (p) =>
                p.clientid ===
                client.clientid,
            );

            if (!rows.length) return null;

            return (
              <section
                className="card overflow-hidden"
                key={client.clientid}
              >
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <b>
                    {client.fullnameorcompanyname}
                  </b>

                  <span className="ml-2 text-xs text-slate-400">
                    {client.clientid} ·{" "}
                    {rows.length} project(s)
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">
                          Project
                        </th>

                        <th className="px-4 py-3">
                          Value
                        </th>

                        <th className="px-4 py-3">
                          Progress
                        </th>

                        <th className="px-4 py-3">
                          Inflow received
                        </th>

                        <th className="px-4 py-3">
                          Approved expenditure
                        </th>

                        <th className="px-4 py-3">
                          Cash position
                        </th>

                        <th className="px-4 py-3">
                          Expected inflow
                        </th>

                        <th className="px-4 py-3">
                          Dates
                        </th>

                        <th className="px-4 py-3">
                          Status
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {rows.map((project) => {
                        const completed =
                          project.status ===
                          "Completed";

                        const inflowReceived =
                          Number(project.inflow ?? 0);

                        const expenditure =
                          Number(project.outflow ?? 0);

                        const projectValue =
                          Number(
                            project.estimatedvalue ?? 0,
                          );

                        const cashPosition =
                          inflowReceived -
                          expenditure;

                        const expectedInflow =
                          projectValue -
                          inflowReceived;

                        return (
                          <tr
                            key={
                              project.projectid
                            }
                          >
                            <td className="px-4 py-3">
                              <b>
                                {
                                  project.projecttitle
                                }
                              </b>

                              <span className="block text-xs text-slate-400">
                                {
                                  project.projectid
                                }{" "}
                                ·{" "}
                                {
                                  project.projectlocation
                                }
                              </span>
                            </td>

                            <td className="px-4 py-3">
                              {canViewFinancial ? (
                                money(
                                  project.estimatedvalue,
                                )
                              ) : (
                                <RestrictedValue />
                              )}
                            </td>

                            <td className="px-4 py-3">
                              <ProgressCell
                                progress={
                                  project.progress
                                }
                              />
                            </td>

                            {!canViewFinancial ? (
                              <td
                                colSpan={4}
                                className="px-4 py-3"
                              >
                                <RestrictedValue />
                              </td>
                            ) : completed ? (
                              <td
                                colSpan={4}
                                className="px-4 py-3 text-xs text-slate-400"
                              >
                                Financial records
                                are hidden for
                                completed
                                projects.
                              </td>
                            ) : (
                              <>
                                <td className="px-4 py-3 text-green-700">
                                  {money(
                                    inflowReceived,
                                  )}
                                </td>

                                <td className="px-4 py-3 text-red-700">
                                  {money(
                                    expenditure,
                                  )}
                                </td>

                                <td
                                  className={`px-4 py-3 font-medium ${
                                    cashPosition < 0
                                      ? "text-red-700"
                                      : "text-ink"
                                  }`}
                                >
                                  {money(
                                    cashPosition,
                                  )}
                                </td>

                                <td
                                  className={`px-4 py-3 font-medium ${
                                    expectedInflow < 0
                                      ? "text-red-700"
                                      : "text-ink"
                                  }`}
                                >
                                  {money(
                                    expectedInflow,
                                  )}
                                </td>
                              </>
                            )}

                            <td className="px-4 py-3 text-xs">
                              {date(
                                project.startdate,
                              )}{" "}
                              to{" "}
                              {date(
                                project.expectedenddate,
                              )}
                            </td>

                            <td className="px-4 py-3">
                              {canEdit ? (
                                <select
                                  aria-label={`Status for ${project.projecttitle}`}
                                  className="field-input min-w-28 py-1 text-xs"
                                  value={
                                    project.status
                                  }
                                  disabled={
                                    saving ===
                                    project.projectid
                                  }
                                  onChange={(e) =>
                                    updateStatus(
                                      project.projectid,
                                      e.target.value,
                                    )
                                  }
                                >
                                  {STATUSES.map(
                                    (value) => (
                                      <option
                                        key={value}
                                      >
                                        {value}
                                      </option>
                                    ),
                                  )}
                                </select>
                              ) : (
                                <span className="rounded-full bg-navy-50 px-2 py-1 text-xs text-navy">
                                  {
                                    project.status
                                  }
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}

          {!visible.length && (
            <div className="card p-10 text-center text-slate-400">
              No projects match the selected
              filters.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RestrictedValue() {
  return (
    <span
      className="inline-block select-none rounded bg-slate-200 px-2 py-1 text-xs font-medium tracking-wide text-slate-500 blur-[1px]"
      title="Financial access restricted"
    >
      Restricted
    </span>
  );
}
