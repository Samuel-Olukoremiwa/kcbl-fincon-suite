"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { date, money } from "@/lib/client-utils";
import ApprovalQueue from "./approval-queue";

type Viewer = {
  userId: string;
  roleName: string;
  department: string | null;
};

type Item = any;

type InflowSource =
  | "Client"
  | "Department";

const DEPARTMENTS = [
  "MD",
  "MD Office",
  "Executive Director",
  "Non-Executive Director",
  "Finance & Admin",
  "Business Development",
  "Operations",
  "Audit/Internal Control",
];

const today = () =>
  new Date()
    .toISOString()
    .slice(0, 10);

function statusBadgeClass(
  status: string,
) {
  const s =
    (status ?? "")
      .toLowerCase();

  if (
    s.includes("approv")
  ) {
    return "badge-success";
  }

  if (
    s.includes("reject")
  ) {
    return "badge-danger";
  }

  if (
    s.includes("pending") ||
    s.includes("awaiting")
  ) {
    return "badge-warning";
  }

  return "badge-neutral";
}

function payeeTypeBadgeClass(
  type: string,
) {
  if (
    type === "Supplier"
  ) {
    return "badge-brand";
  }

  if (
    type === "Subcontractor"
  ) {
    return "badge bg-navy-50 text-navy";
  }

  return "badge-neutral";
}

export default function TransactionsClient({
  viewer,
  clients,
  projects,
  suppliers,
  subcontractors,
  inflows,
  outflows,
}: {
  viewer: Viewer;
  clients: Item[];
  projects: Item[];
  suppliers: Item[];
  subcontractors: Item[];
  inflows: Item[];
  outflows: Item[];
}) {
  const [
    tab,
    setTab,
  ] =
    useState<
      | "inflow"
      | "expense"
      | "approvals"
    >("inflow");

  return (
    <div className="mt-8">
      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        <Tab
          active={
            tab === "inflow"
          }
          onClick={() =>
            setTab("inflow")
          }
        >
          Cash inflow
        </Tab>

        <Tab
          active={
            tab === "expense"
          }
          onClick={() =>
            setTab("expense")
          }
        >
          Expense request
        </Tab>

        <Tab
          active={
            tab ===
            "approvals"
          }
          onClick={() =>
            setTab(
              "approvals",
            )
          }
        >
          Approval queue
        </Tab>
      </div>

      {tab ===
        "inflow" && (
        <Inflow
          viewer={viewer}
          clients={clients}
          projects={projects}
          rows={inflows}
        />
      )}

      {tab ===
        "expense" && (
        <ExpenseRequest
          viewer={viewer}
          projects={projects}
          suppliers={suppliers}
          subcontractors={
            subcontractors
          }
          rows={outflows}
        />
      )}

      {tab ===
        "approvals" && (
        <ApprovalQueue
          viewer={viewer}
          inflows={inflows}
          outflows={outflows}
        />
      )}
    </div>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children:
    React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-4 py-3 text-sm font-medium ${
        active
          ? "border-navy text-navy"
          : "border-transparent text-slate-500"
      }`}
    >
      {children}
    </button>
  );
}

function Inflow({
  viewer,
  clients,
  projects,
  rows,
}: {
  viewer: Viewer;
  clients: Item[];
  projects: Item[];
  rows: Item[];
}) {
  const router =
    useRouter();

  const [
    source,
    setSource,
  ] =
    useState<InflowSource>(
      "Client",
    );

  const [
    selectedClient,
    setSelectedClient,
  ] =
    useState("");

  const [
    selectedProject,
    setSelectedProject,
  ] =
    useState("");

  const [
    selectedDepartment,
    setSelectedDepartment,
  ] =
    useState("");

  const [
    msg,
    setMsg,
  ] =
    useState<
      string | null
    >(null);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const canCreate =
    viewer.roleName ===
      "Super User" ||
    (viewer.department ===
      "Finance & Admin" &&
      viewer.roleName ===
        "Initiator");

  /*
   * Only show projects belonging to the selected client.
   */
  const clientProjects =
    useMemo(() => {
      if (
        !selectedClient
      ) {
        return [];
      }

      return projects.filter(
        (project) =>
          String(
            project.clientid,
          ) ===
          String(
            selectedClient,
          ),
      );
    }, [
      projects,
      selectedClient,
    ]);

  function changeSource(
    nextSource:
      InflowSource,
  ) {
    setSource(
      nextSource,
    );

    /*
     * Clear fields belonging to the previous source.
     * This prevents stale client/project/department
     * values from being submitted.
     */
    if (
      nextSource ===
      "Client"
    ) {
      setSelectedDepartment(
        "",
      );
    } else {
      setSelectedClient(
        "",
      );
      setSelectedProject(
        "",
      );
    }

    setMsg(null);
  }

  function changeClient(
    clientId: string,
  ) {
    setSelectedClient(
      clientId,
    );

    /*
     * A project belongs to a specific client.
     * Whenever the client changes, clear the project
     * so a project from the previous client cannot
     * remain selected.
     */
    setSelectedProject(
      "",
    );

    setMsg(null);
  }

  async function submit(
    e: React.FormEvent<HTMLFormElement>,
  ) {
    e.preventDefault();

    const form =
      e.currentTarget;

    setSaving(true);
    setMsg(null);

    const f =
      new FormData(
        form,
      );

    const get = (
      name: string,
    ) =>
      String(
        f.get(name) ??
          "",
      ).trim();

    const projectId =
      source ===
      "Client"
        ? get(
            "projectid",
          )
        : "";

    const department =
      source ===
      "Department"
        ? get(
            "department",
          )
        : "";

    /*
     * Client source requires both a client and a project.
     */
    if (
      source ===
        "Client" &&
      (!selectedClient ||
        !projectId)
    ) {
      setMsg(
        "Select a client and a project before submitting the cash inflow.",
      );

      setSaving(
        false,
      );

      return;
    }

    /*
     * Department source requires a department.
     */
    if (
      source ===
        "Department" &&
      !department
    ) {
      setMsg(
        "Select a department before submitting the cash inflow.",
      );

      setSaving(
        false,
      );

      return;
    }

    /*
     * Description is mandatory.
     */
    if (
      !get(
        "description",
      )
    ) {
      setMsg(
        "Description is required.",
      );

      setSaving(
        false,
      );

      return;
    }

    try {
      const response =
        await fetch(
          "/api/transactions/inflow",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                {
                  sourceofcash:
                    source,

                  clientid:
                    source ===
                    "Client"
                      ? selectedClient
                      : null,

                  projectid:
                    source ===
                    "Client"
                      ? projectId
                      : null,

                  department:
                    source ===
                    "Department"
                      ? department
                      : null,

                  amount:
                    get(
                      "amount",
                    ),

                  date:
                    get(
                      "date",
                    ),

                  method:
                    get(
                      "method",
                    ),

                  description:
                    get(
                      "description",
                    ),
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
          result.error ||
            "Unable to submit cash inflow.",
        );

        return;
      }

      form.reset();

      setSource(
        "Client",
      );

      setSelectedClient(
        "",
      );

      setSelectedProject(
        "",
      );

      setSelectedDepartment(
        "",
      );

      setMsg(
        "Cash inflow submitted for approval.",
      );

      router.refresh();
    } catch {
      setMsg(
        "Unable to connect to the server.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-6 grid gap-6 xl:grid-cols-[400px_1fr]">
      <div className="card p-6">
        <p className="section-title">
          New cash inflow
        </p>

        {canCreate ? (
          <form
            onSubmit={
              submit
            }
            className="mt-4 space-y-4"
          >
            <div>
              <label className="field-label">
                Source of Cash
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    changeSource(
                      "Client",
                    )
                  }
                  className={
                    source ===
                    "Client"
                      ? "btn-primary"
                      : "btn-secondary"
                  }
                >
                  Client
                </button>

                <button
                  type="button"
                  onClick={() =>
                    changeSource(
                      "Department",
                    )
                  }
                  className={
                    source ===
                    "Department"
                      ? "btn-primary"
                      : "btn-secondary"
                  }
                >
                  Department
                </button>
              </div>
            </div>

            {source ===
              "Client" && (
              <>
                <div>
                  <label
                    htmlFor="clientid"
                    className="field-label"
                  >
                    Client
                  </label>

                  <select
                    id="clientid"
                    name="clientid"
                    className="field-input"
                    value={
                      selectedClient
                    }
                    onChange={(
                      event,
                    ) =>
                      changeClient(
                        event
                          .target
                          .value,
                      )
                    }
                    required
                  >
                    <option value="">
                      Select
                      client…
                    </option>

                    {clients.map(
                      (
                        client,
                      ) => (
                        <option
                          key={
                            client.clientid
                          }
                          value={
                            client.clientid
                          }
                        >
                          {
                            client.fullnameorcompanyname
                          }
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="projectid"
                    className="field-label"
                  >
                    Project
                  </label>

                  <select
                    id="projectid"
                    name="projectid"
                    className="field-input"
                    value={
                      selectedProject
                    }
                    onChange={(
                      event,
                    ) =>
                      setSelectedProject(
                        event
                          .target
                          .value,
                      )
                    }
                    required
                    disabled={
                      !selectedClient
                    }
                  >
                    <option value="">
                      {selectedClient
                        ? "Select project…"
                        : "Select a client first…"}
                    </option>

                    {clientProjects.map(
                      (
                        project,
                      ) => (
                        <option
                          key={
                            project.projectid
                          }
                          value={
                            project.projectid
                          }
                        >
                          {
                            project.projecttitle
                          }
                        </option>
                      ),
                    )}
                  </select>

                  {selectedClient &&
                    clientProjects.length ===
                      0 && (
                      <p className="mt-1 text-xs text-slate-500">
                        No projects are assigned to this client.
                      </p>
                    )}
                </div>
              </>
            )}

            {source ===
              "Department" && (
              <div>
                <label
                  htmlFor="department"
                  className="field-label"
                >
                  Department
                </label>

                <select
                  id="department"
                  name="department"
                  className="field-input"
                  value={
                    selectedDepartment
                  }
                  onChange={(
                    event,
                  ) =>
                    setSelectedDepartment(
                      event
                        .target
                        .value,
                    )
                  }
                  required
                >
                  <option value="">
                    Select
                    department…
                  </option>

                  {DEPARTMENTS.map(
                    (
                      department,
                    ) => (
                      <option
                        key={
                          department
                        }
                        value={
                          department
                        }
                      >
                        {
                          department
                        }
                      </option>
                    ),
                  )}
                </select>
              </div>
            )}

            <Field
              label="Amount (₦)"
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
            />

            <Field
              label="Transaction date"
              name="date"
              type="date"
              min={today()}
              required
            />

            <Select
              label="Payment method"
              name="method"
              values={[
                [
                  "Bank Transfer",
                  "Bank Transfer",
                ],
                [
                  "Cheque",
                  "Cheque",
                ],
              ]}
              required
            />

            <Field
              label="Description"
              name="description"
              required
            />

            <button
              type="submit"
              disabled={
                saving
              }
              className="btn-primary w-full"
            >
              {saving
                ? "Submitting…"
                : "Submit for approval"}
            </button>
          </form>
        ) : (
          <Notice>
            Only an
            Initiator or
            Super User can
            submit cash
            inflow.
          </Notice>
        )}

        {msg && (
          <Error
            message={
              msg
            }
          />
        )}
      </div>

      <TransactionsTable
        rows={rows}
        kind="Inflow"
      />
    </section>
  );
}

function ExpenseRequest({
  viewer,
  projects,
  suppliers,
  subcontractors,
  rows,
}: {
  viewer: Viewer;
  projects: Item[];
  suppliers: Item[];
  subcontractors: Item[];
  rows: Item[];
}) {
  const router =
    useRouter();

  const [
    payee,
    setPayee,
  ] =
    useState<
      | "Supplier"
      | "Subcontractor"
      | "In-House"
    >("Supplier");

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    msg,
    setMsg,
  ] =
    useState<
      string | null
    >(null);

  const [
    categories,
    setCategories,
  ] =
    useState<
      {
        categoryname:
          string;

        isinhouse:
          boolean;
      }[]
    >([]);

  const [
    filterProject,
    setFilterProject,
  ] =
    useState("");

  const [
    filterPayeeType,
    setFilterPayeeType,
  ] =
    useState("");

  useEffect(() => {
    fetch(
      "/api/transactions/categories",
    )
      .then(
        (response) =>
          response.json(),
      )
      .then(
        (result) =>
          setCategories(
            result.categories ??
              [],
          ),
      )
      .catch(
        () =>
          undefined,
      );
  }, []);

  const canCreate =
    viewer.roleName ===
      "Super User" ||
    (viewer.department ===
      "Finance & Admin" &&
      viewer.roleName ===
        "Initiator");

  async function submit(
    e: React.FormEvent<HTMLFormElement>,
  ) {
    e.preventDefault();

    const form =
      e.currentTarget;

    setSaving(true);
    setMsg(null);

    const f =
      new FormData(
        form,
      );

    const get = (
      name: string,
    ) =>
      String(
        f.get(name) ??
          "",
      ).trim();

    try {
      const response =
        await fetch(
          "/api/transactions/outflow",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                {
                  projectid:
                    get(
                      "projectid",
                    ),

                  payeetype:
                    payee,

                  payeeid:
                    payee ===
                    "In-House"
                      ? null
                      : get(
                          "payeeid",
                        ),

                  category:
                    get(
                      "category",
                    ),

                  amount:
                    get(
                      "amount",
                    ),

                  date:
                    get(
                      "date",
                    ),

                  method:
                    get(
                      "method",
                    ),

                  description:
                    get(
                      "description",
                    ),
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
          result.error ||
            "Unable to submit expense request.",
        );

        return;
      }

      form.reset();

      setPayee(
        "Supplier",
      );

      setMsg(
        "Expense request submitted for authorization. It will not affect cash position until approved.",
      );

      router.refresh();
    } catch {
      setMsg(
        "Unable to connect to the server.",
      );
    } finally {
      setSaving(false);
    }
  }

  const payees =
    payee ===
    "Supplier"
      ? suppliers.map(
          (x) => [
            x.supplierid,
            x.suppliername,
          ],
        )
      : payee ===
          "Subcontractor"
        ? subcontractors.map(
            (x) => [
              x.subcontractorid,
              x.subcontractorname,
            ],
          )
        : [];

  const categoryValues =
    categories
      .filter(
        (category) =>
          payee ===
          "In-House"
            ? category.isinhouse
            : !category.isinhouse,
      )
      .map(
        (category) => [
          category.categoryname,
          category.categoryname,
        ],
      );

  const filteredRows =
    useMemo(
      () =>
        rows.filter(
          (row) =>
            (!filterProject ||
              row.projectid ===
                filterProject) &&
            (!filterPayeeType ||
              row.payeetype ===
                filterPayeeType),
        ),
      [
        rows,
        filterProject,
        filterPayeeType,
      ],
    );

  return (
    <section className="mt-6 grid gap-6 xl:grid-cols-[400px_1fr]">
      <div className="card p-6">
        <p className="section-title">
          Expense approval
          request
        </p>

        <p className="mt-1 text-xs text-slate-500">
          Authorization is
          required before this
          becomes an approved
          cash outflow.
        </p>

        {canCreate ? (
          <form
            onSubmit={
              submit
            }
            className="mt-4 space-y-4"
          >
            <Select
              label="Project"
              name="projectid"
              values={projects.map(
                (p) => [
                  p.projectid,
                  p.projecttitle,
                ],
              )}
              required
            />

            <div>
              <label className="field-label">
                Payee type
              </label>

              <div className="flex flex-wrap gap-2">
                {(
                  [
                    "Supplier",
                    "Subcontractor",
                    "In-House",
                  ] as const
                ).map(
                  (type) => (
                    <button
                      type="button"
                      key={type}
                      onClick={() =>
                        setPayee(
                          type,
                        )
                      }
                      className={
                        payee ===
                        type
                          ? "btn-primary"
                          : "btn-secondary"
                      }
                    >
                      {type}
                    </button>
                  ),
                )}
              </div>
            </div>

            {payee !==
              "In-House" && (
              <Select
                label={
                  payee
                }
                name="payeeid"
                values={
                  payees
                }
                required
              />
            )}

            <Select
              label="Category"
              name="category"
              values={
                categoryValues
              }
              required
            />

            <Field
              label="Amount (₦)"
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
            />

            <Field
              label="Request date"
              name="date"
              type="date"
              min={today()}
              required
            />

            <Select
              label="Payment method"
              name="method"
              values={[
                [
                  "Bank Transfer",
                  "Bank Transfer",
                ],
                [
                  "Cheque",
                  "Cheque",
                ],
              ]}
              required
            />

            <Field
              label="Description"
              name="description"
              required
            />

            <button
              type="submit"
              disabled={
                saving
              }
              className="btn-primary w-full"
            >
              {saving
                ? "Submitting…"
                : "Submit expense request"}
            </button>
          </form>
        ) : (
          <Notice>
            Only an Initiator
            or Super User can
            submit an expense
            request.
          </Notice>
        )}

        {msg && (
          <Error
            message={msg}
          />
        )}
      </div>

      <div>
        <div className="card mb-4 flex flex-wrap gap-3 p-4">
          <select
            className="field-input max-w-[220px]"
            value={
              filterProject
            }
            onChange={(
              event,
            ) =>
              setFilterProject(
                event
                  .target
                  .value,
              )
            }
          >
            <option value="">
              All projects
            </option>

            {projects.map(
              (project) => (
                <option
                  key={
                    project.projectid
                  }
                  value={
                    project.projectid
                  }
                >
                  {
                    project.projecttitle
                  }
                </option>
              ),
            )}
          </select>

          <select
            className="field-input max-w-[200px]"
            value={
              filterPayeeType
            }
            onChange={(
              event,
            ) =>
              setFilterPayeeType(
                event
                  .target
                  .value,
              )
            }
          >
            <option value="">
              All payee types
            </option>

            <option value="Supplier">
              Supplier
            </option>

            <option value="Subcontractor">
              Subcontractor
            </option>

            <option value="In-House">
              In-House
            </option>
          </select>

          {(filterProject ||
            filterPayeeType) && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setFilterProject(
                  "",
                );

                setFilterPayeeType(
                  "",
                );
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        <TransactionsTable
          rows={
            filteredRows
          }
          kind="Expense request"
          showPayee
        />
      </div>
    </section>
  );
}

function TransactionsTable({
  rows,
  kind,
  showPayee = false,
}: {
  rows: Item[];
  kind: string;
  showPayee?: boolean;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">
                Reference
              </th>

              <th className="px-4 py-3">
                Project
              </th>

              {showPayee && (
                <th className="px-4 py-3">
                  Payee
                </th>
              )}

              <th className="px-4 py-3">
                Amount
              </th>

              <th className="px-4 py-3">
                Request date
              </th>

              <th className="px-4 py-3">
                Status
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {rows.map(
              (row) => (
                <tr
                  key={
                    row.transactionid
                  }
                  className="row-interactive"
                >
                  <td className="px-4 py-3">
                    <b>
                      {
                        row.transactionid
                      }
                    </b>

                    <span className="block text-xs text-slate-400">
                      {kind} ·{" "}
                      {
                        row.paymentmethod
                      }
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <span className="font-medium text-ink">
                      {row.projectname ??
                        "No project"}
                    </span>

                    <span className="block text-xs text-slate-400">
                      {row.projectid ??
                        "—"}
                    </span>

                    {kind ===
                      "Inflow" &&
                      row.sourceofcash ===
                        "Department" && (
                        <span className="mt-1 block text-xs text-slate-500">
                          Department:{" "}
                          {
                            row.department
                          }
                        </span>
                      )}

                    {kind ===
                      "Inflow" &&
                      row.sourceofcash ===
                        "Client" &&
                      row.clientname && (
                        <span className="mt-1 block text-xs text-slate-500">
                          Source:{" "}
                          {
                            row.clientname
                          }
                        </span>
                      )}
                  </td>

                  {showPayee && (
                    <td className="px-4 py-3">
                      <span
                        className={payeeTypeBadgeClass(
                          row.payeetype,
                        )}
                      >
                        {row.payeetype ??
                          "—"}
                      </span>

                      {row.payeename &&
                        row.payeetype !==
                          "In-House" && (
                          <span className="block text-xs text-slate-400">
                            {
                              row.payeename
                            }
                          </span>
                        )}
                    </td>
                  )}

                  <td className="px-4 py-3">
                    {money(
                      row.amount,
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {date(
                      row.transactiondate,
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={statusBadgeClass(
                        row.approvalstatus,
                      )}
                    >
                      {
                        row.approvalstatus
                      }
                    </span>
                  </td>
                </tr>
              ),
            )}

            {!rows.length && (
              <tr>
                <td
                  colSpan={
                    showPayee
                      ? 6
                      : 5
                  }
                  className="px-4 py-10 text-center text-slate-400"
                >
                  No records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="field-label"
      >
        {label}
      </label>

      <input
        id={name}
        name={name}
        className="field-input"
        {...props}
      />
    </div>
  );
}

function Select({
  label,
  name,
  values,
  required,
}: {
  label: string;
  name: string;
  values: string[][];
  required?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="field-label"
      >
        {label}
      </label>

      <select
        id={name}
        name={name}
        required={required}
        className="field-input"
      >
        <option value="">
          Select…
        </option>

        {values.map(
          (value) => (
            <option
              key={
                value[0]
              }
              value={
                value[0]
              }
            >
              {value[1]}
            </option>
          ),
        )}
      </select>
    </div>
  );
}

function Error({
  message,
}: {
  message: string;
}) {
  return (
    <p className="mt-3 text-sm text-red-600">
      {message}
    </p>
  );
}

function Notice({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <p className="mt-3 text-sm text-amber-700">
      {children}
    </p>
  );
}