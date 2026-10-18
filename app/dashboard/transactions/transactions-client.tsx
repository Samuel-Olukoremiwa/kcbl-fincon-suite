
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
type InflowSource = "Client" | "Department";
type PayeeType = "Supplier" | "Subcontractor" | "In-House";

type Category = {
  categoryname: string;
  isinhouse: boolean;
  availableforall?: boolean;
};

type ExpenseLine = {
  category: string;
  amount: string;
};

const ALLOW_UNASSIGNED_PAYEES =
  process.env.NEXT_PUBLIC_ALLOW_UNASSIGNED_EXPENSE_PAYEES ===
  "true";

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

const today = () => {
  const now = new Date();
  const local = new Date(
    now.getTime() - now.getTimezoneOffset() * 60000,
  );
  return local.toISOString().slice(0, 10);
};

function statusBadgeClass(status: string) {
  const s = (status ?? "").toLowerCase();

  if (s.includes("approv")) return "badge-success";
  if (s.includes("reject")) return "badge-danger";
  if (s.includes("pending") || s.includes("awaiting"))
    return "badge-warning";

  return "badge-neutral";
}

function payeeTypeBadgeClass(type: string) {
  if (type === "Supplier") return "badge-brand";

  if (type === "Subcontractor")
    return "badge bg-navy-50 text-navy";

  return "badge-neutral";
}

function hasCreateAccess(viewer: Viewer) {
  return (
    viewer.roleName === "Super User" ||
    (viewer.department === "Finance & Admin" &&
      viewer.roleName === "Initiator")
  );
}

function parseAmountCents(value: string) {
  const cleaned = value.replace(/,/g, "").trim();

  if (
    !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(cleaned)
  ) {
    return null;
  }

  const cents = Math.round(Number(cleaned) * 100);

  return Number.isSafeInteger(cents) && cents > 0
    ? cents
    : null;
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
  const [tab, setTab] = useState<
    "inflow" | "expense" | "approvals"
  >("inflow");

  return (
    <div className="mt-8">
      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        <Tab
          active={tab === "inflow"}
          onClick={() => setTab("inflow")}
        >
          Cash inflow
        </Tab>

        <Tab
          active={tab === "expense"}
          onClick={() => setTab("expense")}
        >
          Expense request
        </Tab>

        <Tab
          active={tab === "approvals"}
          onClick={() => setTab("approvals")}
        >
          Approval queue
        </Tab>
      </div>

      {tab === "inflow" && (
        <Inflow
          viewer={viewer}
          clients={clients}
          projects={projects}
          rows={inflows}
        />
      )}

      {tab === "expense" && (
        <ExpenseRequest
          viewer={viewer}
          projects={projects}
          suppliers={suppliers}
          subcontractors={subcontractors}
          rows={outflows}
        />
      )}

      {tab === "approvals" && (
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
  children: React.ReactNode;
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
  const router = useRouter();

  const [source, setSource] =
    useState<InflowSource>("Client");

  const [selectedClient, setSelectedClient] =
    useState("");

  const [selectedProject, setSelectedProject] =
    useState("");

  const [selectedDepartment, setSelectedDepartment] =
    useState("");

  const [inflowAmount, setInflowAmount] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canCreate = hasCreateAccess(viewer);

  const clientProjects = useMemo(() => {
    if (!selectedClient) return [];

    return projects.filter(
      (project) =>
        String(project.clientid) ===
        String(selectedClient),
    );
  }, [projects, selectedClient]);

  function changeSource(nextSource: InflowSource) {
    setSource(nextSource);

    if (nextSource === "Client") {
      setSelectedDepartment("");
    } else {
      setSelectedClient("");
      setSelectedProject("");
    }

    setMsg(null);
  }

  function changeClient(clientId: string) {
    setSelectedClient(clientId);
    setSelectedProject("");
    setMsg(null);
  }

  async function submit(
    e: React.FormEvent<HTMLFormElement>,
  ) {
    e.preventDefault();

    const form = e.currentTarget;
    const data = new FormData(form);

    const get = (name: string) =>
      String(data.get(name) ?? "").trim();

    const projectId =
      source === "Client" ? get("projectid") : "";

    const department =
      source === "Department"
        ? get("department")
        : "";

    if (
      source === "Client" &&
      (!selectedClient || !projectId)
    ) {
      setMsg("Select a client and a project.");
      return;
    }

    if (source === "Department" && !department) {
      setMsg("Select a department.");
      return;
    }

    if (!get("description")) {
      setMsg("Description is required.");
      return;
    }

    if (parseAmountCents(inflowAmount) === null) {
      setMsg("Enter a valid amount greater than zero.");
      return;
    }

    setSaving(true);
    setMsg(null);

    try {
      const response = await fetch(
        "/api/transactions/inflow",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sourceofcash: source,
            clientid:
              source === "Client"
                ? selectedClient
                : null,
            projectid:
              source === "Client"
                ? projectId
                : null,
            department:
              source === "Department"
                ? department
                : null,
            amount: inflowAmount.replace(/,/g, ""),
            date: get("date"),
            method: get("method"),
            description: get("description"),
          }),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        setMsg(
          result.error ||
            "Unable to submit cash inflow.",
        );
        return;
      }

      form.reset();
      setInflowAmount("");
      setSource("Client");
      setSelectedClient("");
      setSelectedProject("");
      setSelectedDepartment("");

      setMsg("Cash inflow submitted for approval.");
      router.refresh();
    } catch {
      setMsg("Unable to connect to the server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-6 grid gap-6 xl:grid-cols-[400px_1fr]">
      <div className="card p-6">
        <p className="section-title">New cash inflow</p>

        {canCreate ? (
          <form
            onSubmit={submit}
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
                    changeSource("Client")
                  }
                  className={
                    source === "Client"
                      ? "btn-primary"
                      : "btn-secondary"
                  }
                >
                  Client
                </button>

                <button
                  type="button"
                  onClick={() =>
                    changeSource("Department")
                  }
                  className={
                    source === "Department"
                      ? "btn-primary"
                      : "btn-secondary"
                  }
                >
                  Department
                </button>
              </div>
            </div>

            {source === "Client" && (
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
                    value={selectedClient}
                    onChange={(event) =>
                      changeClient(event.target.value)
                    }
                    required
                  >
                    <option value="">
                      Select client…
                    </option>

                    {clients.map((client) => (
                      <option
                        key={client.clientid}
                        value={client.clientid}
                      >
                        {client.fullnameorcompanyname}
                      </option>
                    ))}
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
                    value={selectedProject}
                    onChange={(event) =>
                      setSelectedProject(
                        event.target.value,
                      )
                    }
                    disabled={!selectedClient}
                    required
                  >
                    <option value="">
                      {selectedClient
                        ? "Select project…"
                        : "Select a client first…"}
                    </option>

                    {clientProjects.map((project) => (
                      <option
                        key={project.projectid}
                        value={project.projectid}
                      >
                        {project.projecttitle}
                      </option>
                    ))}
                  </select>

                  {selectedClient &&
                    clientProjects.length === 0 && (
                      <p className="mt-1 text-xs text-slate-500">
                        No projects are assigned to this
                        client.
                      </p>
                    )}
                </div>
              </>
            )}

            {source === "Department" && (
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
                  value={selectedDepartment}
                  onChange={(event) =>
                    setSelectedDepartment(
                      event.target.value,
                    )
                  }
                  required
                >
                  <option value="">
                    Select department…
                  </option>

                  {DEPARTMENTS.map((department) => (
                    <option
                      key={department}
                      value={department}
                    >
                      {department}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <MoneyInput
              label="Amount (₦)"
              name="amount"
              value={inflowAmount}
              onChange={setInflowAmount}
            />

            <Field
              label="Transaction date"
              name="date"
              type="date"
              max={today()}
              defaultValue={today()}
              required
            />

            <Select
              label="Payment method"
              name="method"
              values={[
                ["Bank Transfer", "Bank Transfer"],
                ["Cheque", "Cheque"],
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
              disabled={saving}
              className="btn-primary w-full"
            >
              {saving
                ? "Submitting…"
                : "Submit for approval"}
            </button>
          </form>
        ) : (
          <Notice>
            Only an Initiator or Super User can submit
            cash inflow.
          </Notice>
        )}

        {msg && <Message message={msg} />}
      </div>

      <TransactionsTable rows={rows} kind="Inflow" />
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
  const router = useRouter();

  const [payee, setPayee] =
    useState<PayeeType>("Supplier");

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [categories, setCategories] = useState<
    Category[]
  >([]);

  const [expenseLines, setExpenseLines] = useState<
    ExpenseLine[]
  >([{ category: "", amount: "" }]);

  const [filterProject, setFilterProject] =
    useState("");

  const [filterPayeeType, setFilterPayeeType] =
    useState("");

  useEffect(() => {
    fetch("/api/transactions/categories")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            "Unable to load expense categories.",
          );
        }

        return response.json();
      })
      .then((result) =>
        setCategories(result.categories ?? []),
      )
      .catch(() => {
        setCategories([]);
        setMsg("Unable to load expense categories.");
      });
  }, []);

  const canCreate = hasCreateAccess(viewer);

  const payees: string[][] =
    payee === "Supplier"
      ? suppliers.map((item) => [
          String(item.supplierid),
          String(item.suppliername),
        ])
      : payee === "Subcontractor"
        ? subcontractors.map((item) => [
            String(item.subcontractorid),
            String(item.subcontractorname),
          ])
        : [];

  /*
   * Shared categories are available for every type.
   *
   * Otherwise:
   * - In-House uses isinhouse=true
   * - Supplier/Subcontractor use isinhouse=false
   */
  const availableCategories = useMemo(
    () =>
      categories.filter(
        (category) =>
          category.availableforall === true ||
          Boolean(category.isinhouse) ===
            (payee === "In-House"),
      ),
    [categories, payee],
  );

  const categoryValues: string[][] =
    availableCategories.map((category) => [
      category.categoryname,
      category.categoryname,
    ]);

  const expenseTotalCents = expenseLines.reduce(
    (sum, line) =>
      sum + (parseAmountCents(line.amount) ?? 0),
    0,
  );

  const expenseTotal = expenseTotalCents / 100;

  const filteredRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          (!filterProject ||
            row.projectid === filterProject) &&
          (!filterPayeeType ||
            row.payeetype === filterPayeeType),
      ),
    [rows, filterProject, filterPayeeType],
  );

  function changePayee(type: PayeeType) {
    if (type === payee) return;

    setPayee(type);
    setExpenseLines([
      { category: "", amount: "" },
    ]);
    setMsg(null);
  }

  function updateLine(
    index: number,
    values: Partial<ExpenseLine>,
  ) {
    setExpenseLines((current) =>
      current.map((line, position) =>
        position === index
          ? { ...line, ...values }
          : line,
      ),
    );
  }

  async function submit(
    e: React.FormEvent<HTMLFormElement>,
  ) {
    e.preventDefault();

    const form = e.currentTarget;
    const data = new FormData(form);

    const get = (name: string) =>
      String(data.get(name) ?? "").trim();

    const payeeid =
      payee === "In-House"
        ? null
        : get("payeeid") || null;

    if (
      payee !== "In-House" &&
      !payeeid &&
      !ALLOW_UNASSIGNED_PAYEES
    ) {
      setMsg(
        `Please select a ${payee.toLowerCase()}.`,
      );
      return;
    }

    if (
      !expenseLines.length ||
      expenseLines.some(
        (line) =>
          !line.category ||
          parseAmountCents(line.amount) === null,
      )
    ) {
      setMsg(
        "Every category must have a valid amount greater than zero.",
      );
      return;
    }

    const chosen = expenseLines.map(
      (line) => line.category,
    );

    if (new Set(chosen).size !== chosen.length) {
      setMsg(
        "Select a different category for each line.",
      );
      return;
    }

    if (
      expenseLines.some(
        (line) =>
          !availableCategories.some(
            (category) =>
              category.categoryname ===
              line.category,
          ),
      )
    ) {
      setMsg(
        "One or more categories are unavailable for this payee type.",
      );
      return;
    }

    if (
      !Number.isSafeInteger(expenseTotalCents) ||
      expenseTotalCents <= 0
    ) {
      setMsg("Enter a valid total expense amount.");
      return;
    }

    setSaving(true);
    setMsg(null);

    try {
      const response = await fetch(
        "/api/transactions/outflow",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectid: get("projectid"),
            payeetype: payee,
            payeeid,
            categories: expenseLines.map(
              (line) => ({
                category: line.category,
                amount: line.amount,
              }),
            ),
            date: get("date"),
            method: get("method"),
            description: get("description"),
          }),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        setMsg(
          result.error ||
            "Unable to submit expense request.",
        );
        return;
      }

      form.reset();

      setPayee("Supplier");
      setExpenseLines([
        { category: "", amount: "" },
      ]);

      setMsg(
        result.payeeReconciliationRequired
          ? "Expense submitted for authorization. Supplier/subcontractor reconciliation will be required later."
          : "Expense request submitted for authorization. It will not affect cash position until approved.",
      );

      router.refresh();
    } catch {
      setMsg("Unable to connect to the server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-6 grid gap-6 xl:grid-cols-[400px_1fr]">
      <div className="card p-6">
        <p className="section-title">
          Expense approval request
        </p>

        <p className="mt-1 text-xs text-slate-500">
          Authorization is required before this
          becomes an approved cash outflow.
        </p>

        {ALLOW_UNASSIGNED_PAYEES && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <strong>
              Historical backlog mode enabled.
            </strong>{" "}
            Supplier and subcontractor selection is
            temporarily optional. Unassigned entries
            must be reconciled later.
          </div>
        )}

        {canCreate ? (
          <form
            onSubmit={submit}
            className="mt-4 space-y-4"
          >
            <Select
              label="Project"
              name="projectid"
              values={projects.map((project) => [
                String(project.projectid),
                String(project.projecttitle),
              ])}
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
                ).map((type) => (
                  <button
                    type="button"
                    key={type}
                    onClick={() =>
                      changePayee(type)
                    }
                    className={
                      payee === type
                        ? "btn-primary"
                        : "btn-secondary"
                    }
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {payee !== "In-House" && (
              <div>
                <Select
                  key={payee}
                  label={
                    ALLOW_UNASSIGNED_PAYEES
                      ? `${payee} (optional for backlog)`
                      : payee
                  }
                  name="payeeid"
                  values={payees}
                  required={
                    !ALLOW_UNASSIGNED_PAYEES
                  }
                />

                {ALLOW_UNASSIGNED_PAYEES && (
                  <p className="mt-1 text-xs text-amber-700">
                    You may leave this field blank
                    while entering historical expenses.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-3">
              <p className="field-label">
                Expense categories and amounts
              </p>

              {expenseLines.map((line, index) => (
                <div
                  key={index}
                  className="space-y-3 rounded-md border border-slate-200 p-3"
                >
                  <div>
                    <label className="field-label">
                      Category {index + 1}
                    </label>

                    <select
                      className="field-input"
                      required
                      value={line.category}
                      onChange={(event) =>
                        updateLine(index, {
                          category:
                            event.target.value,
                        })
                      }
                    >
                      <option value="">
                        Select category…
                      </option>

                      {categoryValues.map(
                        ([value, label]) => (
                          <option
                            key={value}
                            value={value}
                            disabled={expenseLines.some(
                              (other, position) =>
                                position !== index &&
                                other.category ===
                                  value,
                            )}
                          >
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </div>

                  <MoneyInput
                    label="Amount (₦)"
                    value={line.amount}
                    onChange={(amount) =>
                      updateLine(index, {
                        amount,
                      })
                    }
                  />

                  {expenseLines.length > 1 && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() =>
                        setExpenseLines(
                          (current) =>
                            current.filter(
                              (_, position) =>
                                position !== index,
                            ),
                        )
                      }
                    >
                      Remove category
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                className="btn-secondary"
                disabled={
                  expenseLines.length >= 30 ||
                  expenseLines.length >=
                    categoryValues.length
                }
                onClick={() =>
                  setExpenseLines((current) => [
                    ...current,
                    {
                      category: "",
                      amount: "",
                    },
                  ])
                }
              >
                + Add another category
              </button>

              <p className="text-lg font-semibold">
                Total expense: {money(expenseTotal)}
              </p>
            </div>

            <Field
              label="Transaction date"
              name="date"
              type="date"
              max={today()}
              defaultValue={today()}
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
                ["Cheque", "Cheque"],
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
              disabled={saving}
              className="btn-primary w-full"
            >
              {saving
                ? "Submitting…"
                : "Submit expense request"}
            </button>
          </form>
        ) : (
          <Notice>
            Only an Initiator or Super User can
            submit an expense request.
          </Notice>
        )}

        {msg && <Message message={msg} />}
      </div>

      <div>
        <div className="card mb-4 flex flex-wrap gap-3 p-4">
          <select
            className="field-input max-w-[220px]"
            value={filterProject}
            onChange={(event) =>
              setFilterProject(
                event.target.value,
              )
            }
          >
            <option value="">
              All projects
            </option>

            {projects.map((project) => (
              <option
                key={project.projectid}
                value={project.projectid}
              >
                {project.projecttitle}
              </option>
            ))}
          </select>

          <select
            className="field-input max-w-[200px]"
            value={filterPayeeType}
            onChange={(event) =>
              setFilterPayeeType(
                event.target.value,
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

            <option value="Unassigned">
              Unassigned
            </option>
          </select>

          {(filterProject ||
            filterPayeeType) && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setFilterProject("");
                setFilterPayeeType("");
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        <TransactionsTable
          rows={filteredRows}
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
                Transaction date
              </th>
              <th className="px-4 py-3">
                Status
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr
                key={row.transactionid}
                className="row-interactive"
              >
                <td className="px-4 py-3">
                  <b>{row.transactionid}</b>
                  <span className="block text-xs text-slate-400">
                    {kind} · {row.paymentmethod}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <span className="font-medium text-ink">
                    {row.projectname ??
                      "No project"}
                  </span>

                  <span className="block text-xs text-slate-400">
                    {row.projectid ?? "—"}
                  </span>

                  {kind === "Inflow" &&
                    row.sourceofcash ===
                      "Department" && (
                      <span className="mt-1 block text-xs text-slate-500">
                        Department:{" "}
                        {row.department}
                      </span>
                    )}

                  {kind === "Inflow" &&
                    row.sourceofcash ===
                      "Client" &&
                    row.clientname && (
                      <span className="mt-1 block text-xs text-slate-500">
                        Source: {row.clientname}
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
                      {row.payeetype ?? "—"}
                    </span>

                    {row.payeename &&
                      row.payeetype !==
                        "In-House" && (
                        <span className="block text-xs text-slate-400">
                          {row.payeename}
                        </span>
                      )}
                  </td>
                )}

                <td className="px-4 py-3">
                  {money(row.amount)}
                </td>

                <td className="px-4 py-3">
                  {date(row.transactiondate)}
                </td>

                <td className="px-4 py-3">
                  <span
                    className={statusBadgeClass(
                      row.approvalstatus,
                    )}
                  >
                    {row.approvalstatus}
                  </span>
                </td>
              </tr>
            ))}

            {!rows.length && (
              <tr>
                <td
                  colSpan={
                    showPayee ? 6 : 5
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

        {values.map(([value, label]) => (
          <option
            key={value}
            value={value}
          >
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

function MoneyInput({
  value,
  onChange,
  label,
  name,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  name?: string;
}) {
  const parts = value.split(".");

  const formatted =
    (parts[0] || "").replace(
      /\B(?=(\d{3})+(?!\d))/g,
      ",",
    ) +
    (parts.length > 1
      ? `.${parts[1]}`
      : "");

  return (
    <div>
      <label className="field-label">
        {label}
      </label>

      <input
        name={name}
        type="text"
        inputMode="decimal"
        className="field-input"
        placeholder="0.00"
        value={formatted}
        required
        onChange={(event) => {
          let clean = event.target.value
            .replace(/,/g, "")
            .replace(/[^\d.]/g, "");

          const dot = clean.indexOf(".");

          if (dot >= 0) {
            clean =
              clean.slice(0, dot + 1) +
              clean
                .slice(dot + 1)
                .replace(/\./g, "")
                .slice(0, 2);
          }

          onChange(clean);
        }}
      />
    </div>
  );
}

function Message({
  message,
}: {
  message: string;
}) {
  const isSuccess =
    message.toLowerCase().includes(
      "submitted",
    ) ||
    message.toLowerCase().includes(
      "success",
    );

  return (
    <p
      className={`mt-3 text-sm ${
        isSuccess
          ? "text-emerald-600"
          : "text-red-600"
      }`}
    >
      {message}
    </p>
  );
}

function Notice({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <p className="mt-3 text-sm text-amber-700">
      {children}
    </p>
  );
}
