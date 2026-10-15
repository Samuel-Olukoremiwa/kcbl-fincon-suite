"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ROLES = [
  "Project Manager",
  "Senior Supervisor",
  "Junior Supervisor",
  "QS",
  "Site Engineer",
  "Operations Staff",
];

export default function AssignmentsWorkspace({
  projects,
  staff,
  assignments,
  canCreate,
  canApprove,
}: {
  projects: any[];
  staff: any[];
  assignments: any[];
  canCreate: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();

  const [message, setMessage] =
    useState<string | null>(null);

  const [
    selectedProjectIds,
    setSelectedProjectIds,
  ] = useState<string[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState("All statuses");
  const [projectFilter, setProjectFilter] =
    useState("All projects");
  const [staffFilter, setStaffFilter] =
    useState("All staff");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filteredAssignments =
    assignments.filter((assignment) => {
      const matchesSearch = [
        assignment.projectid,
        assignment.projects?.projecttitle,
        assignment.users?.fullname,
        assignment.assignmentrole,
        assignment.authorizerName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase());

      const initiated =
        assignment.assignedat?.slice(
          0,
          10,
        ) ?? "";

      return (
        matchesSearch &&
        (statusFilter === "All statuses" ||
          assignment.approvalstatus ===
            statusFilter) &&
        (projectFilter === "All projects" ||
          assignment.projectid ===
            projectFilter) &&
        (staffFilter === "All staff" ||
          assignment.userid ===
            staffFilter) &&
        (!fromDate || initiated >= fromDate) &&
        (!toDate || initiated <= toDate)
      );
    });

  function toggleProject(
    projectid: string,
  ) {
    setSelectedProjectIds((current) =>
      current.includes(projectid)
        ? current.filter(
            (value) => value !== projectid,
          )
        : [...current, projectid],
    );
  }

  async function create(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const form = event.currentTarget;

    if (!selectedProjectIds.length) {
      setMessage(
        "Select at least one project.",
      );
      return;
    }

    const data = new FormData(form);

    const response = await fetch(
      "/api/assignments",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          projectids:
            selectedProjectIds,
          userid:
            data.get("userid"),
          assignmentrole:
            data.get(
              "assignmentrole",
            ),
        }),
      },
    );

    const result = await response.json();

    setMessage(
      response.ok
        ? result.message ??
          "Assignments submitted for MD Office authorization."
        : result.error ??
          "Could not create the assignments.",
    );

    if (response.ok) {
      form.reset();
      setSelectedProjectIds([]);
      router.refresh();
    }
  }

  async function decide(
    id: number,
    decision: string,
  ) {
    const response = await fetch(
      `/api/assignments/${id}/approve`,
      {
        method: "PATCH",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          decision,
        }),
      },
    );

    const result = await response.json();

    setMessage(
      response.ok
        ? `Assignment ${decision.toLowerCase()}.`
        : result.error,
    );

    if (response.ok) {
      router.refresh();
    }
  }

  return (
    <div
      className={`mt-7 grid gap-6 ${
        canCreate
          ? "xl:grid-cols-[400px_1fr]"
          : "grid-cols-1"
      }`}
    >
      {canCreate && (
        <form
          className="card p-6"
          onSubmit={create}
        >
          <h2 className="font-semibold">
            Assign staff to projects
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Select one or more projects. Each project creates its own assignment request and only approved assignments grant access.
          </p>

          <div className="mt-4">
            <span className="field-label">
              Projects
            </span>

            <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-3">
              {projects.map((project) => (
                <label
                  key={project.projectid}
                  className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 hover:bg-white"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selectedProjectIds.includes(
                      project.projectid,
                    )}
                    onChange={() =>
                      toggleProject(
                        project.projectid,
                      )
                    }
                  />

                  <span className="text-sm">
                    <b>
                      {project.projectid}
                    </b>
                    {" · "}
                    {project.projecttitle}
                  </span>
                </label>
              ))}
            </div>

            <p className="mt-2 text-xs text-slate-500">
              {selectedProjectIds.length} project
              {selectedProjectIds.length === 1
                ? ""
                : "s"}{" "}
              selected
            </p>
          </div>

          <label className="mt-4 block">
            <span className="field-label">
              Staff member
            </span>

            <select
              className="field-input"
              name="userid"
              required
            >
              <option value="">
                Select staff…
              </option>

              {staff.map((user) => (
                <option
                  key={user.userid}
                  value={user.userid}
                >
                  {user.fullname} ·{" "}
                  {user.department ??
                    "No department"}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-4 block">
            <span className="field-label">
              Project role
            </span>

            <select
              className="field-input"
              name="assignmentrole"
              required
            >
              {ROLES.map((role) => (
                <option key={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>

          <button
            className="btn-primary mt-5 w-full"
            disabled={
              !selectedProjectIds.length
            }
          >
            Submit for authorization
          </button>
        </form>
      )}

      <section className="card overflow-hidden">
        <div className="border-b p-5">
          <h2 className="font-semibold">
            Assignment register
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Pending, approved, and rejected assignment requests are retained here.
          </p>

          {message && (
            <p className="mt-2 text-sm text-navy">
              {message}
            </p>
          )}
        </div>

        <div className="grid gap-3 border-b bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-3">
          <input
            className="field-input"
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value,
              )
            }
            placeholder="Search project, staff, role or authorizer…"
          />

          <select
            className="field-input"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value,
              )
            }
          >
            <option>
              All statuses
            </option>
            <option>Pending</option>
            <option>Approved</option>
            <option>Rejected</option>
          </select>

          <select
            className="field-input"
            value={projectFilter}
            onChange={(event) =>
              setProjectFilter(
                event.target.value,
              )
            }
          >
            <option>
              All projects
            </option>

            {projects.map((project) => (
              <option
                key={project.projectid}
                value={project.projectid}
              >
                {project.projectid} ·{" "}
                {project.projecttitle}
              </option>
            ))}
          </select>

          <select
            className="field-input"
            value={staffFilter}
            onChange={(event) =>
              setStaffFilter(
                event.target.value,
              )
            }
          >
            <option>
              All staff
            </option>

            {staff.map((person) => (
              <option
                key={person.userid}
                value={person.userid}
              >
                {person.fullname}
              </option>
            ))}
          </select>

          <label>
            <span className="field-label">
              Initiated from
            </span>

            <input
              className="field-input"
              type="date"
              value={fromDate}
              onChange={(event) =>
                setFromDate(
                  event.target.value,
                )
              }
            />
          </label>

          <label>
            <span className="field-label">
              Initiated to
            </span>

            <input
              className="field-input"
              type="date"
              value={toDate}
              onChange={(event) =>
                setToDate(
                  event.target.value,
                )
              }
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">
                  Project
                </th>
                <th className="px-4 py-3">
                  Staff
                </th>
                <th className="px-4 py-3">
                  Role
                </th>
                <th className="px-4 py-3">
                  Status
                </th>
                <th className="px-4 py-3">
                  Request history
                </th>
                {canApprove && (
                  <th className="px-4 py-3">
                    Action
                  </th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y">
              {filteredAssignments.map(
                (assignment) => (
                  <tr
                    key={
                      assignment.assignmentid
                    }
                  >
                    <td className="px-4 py-3">
                      <b>
                        {assignment.projectid}
                      </b>

                      <span className="block text-xs text-slate-400">
                        {
                          assignment.projects
                            ?.projecttitle
                        }
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      {
                        assignment.users
                          ?.fullname
                      }
                    </td>

                    <td className="px-4 py-3">
                      {
                        assignment.assignmentrole
                      }
                    </td>

                    <td className="px-4 py-3 font-medium">
                      {
                        assignment.approvalstatus
                      }
                    </td>

                    <td className="px-4 py-3 text-xs text-slate-500">
                      Initiated{" "}
                      {new Date(
                        assignment.assignedat,
                      ).toLocaleString(
                        "en-NG",
                      )}

                      <span className="mt-1 block">
                        {assignment.authorizedat
                          ? `${assignment.approvalstatus} by ${
                              assignment.authorizerName ??
                              "MD Office"
                            } · ${new Date(
                              assignment.authorizedat,
                            ).toLocaleString(
                              "en-NG",
                            )}`
                          : "Awaiting MD Office authorization"}
                      </span>
                    </td>

                    {canApprove && (
                      <td className="px-4 py-3">
                        {assignment.approvalstatus ===
                          "Pending" && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() =>
                                decide(
                                  assignment.assignmentid,
                                  "Approved",
                                )
                              }
                            >
                              Approve
                            </button>

                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() =>
                                decide(
                                  assignment.assignmentid,
                                  "Rejected",
                                )
                              }
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ),
              )}

              {!filteredAssignments.length && (
                <tr>
                  <td
                    colSpan={
                      canApprove ? 6 : 5
                    }
                    className="px-4 py-10 text-center text-slate-400"
                  >
                    No assignments match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
