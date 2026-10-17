"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Client = {
  clientid: string;
  fullnameorcompanyname: string;
};

type Manager = {
  userid: string;
  fullname: string;
  department?: string | null;
};

export default function ProjectForm({
  existingIds,
  clients,
  managers,
}: {
  existingIds?: string[];
  clients: Client[];
  managers: Manager[];
}) {
  const router = useRouter();

  void existingIds;

  const [saving, setSaving] = useState(false);
  const [message, setMessage] =
    useState<string | null>(null);

  async function submit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setMessage(null);
    setSaving(true);

    const form = event.currentTarget;
    const data = new FormData(form);

    const get = (name: string) =>
      String(data.get(name) ?? "").trim();

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientid: get("clientid"),
          title: get("title"),
          location: get("location"),
          type: get("type"),
          value: get("value"),
          start: get("start"),
          end: get("end"),
          manager: get("manager"),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(
          result.error ?? "Could not create project.",
        );
        return;
      }

      form.reset();

      setMessage(
        `${result.projectid ?? "Project"} created and the Project Manager was assigned.`,
      );

      router.refresh();
    } catch {
      setMessage(
        "Could not connect to the server.",
      );
    } finally {
      setSaving(false);
    }
  }

  function field(
    label: string,
    name: string,
    type = "text",
    required = true,
  ) {
    return (
      <div>
        <label className="field-label">
          {label}
        </label>

        <input
          name={name}
          type={type}
          required={required}
          className="field-input"
        />
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <p className="section-title">
        New project
      </p>

      <p className="mt-1 text-sm text-slate-500">
        Every new project must have a Project Manager before it is created.
      </p>

      <div className="mt-4 grid gap-4">
        <div>
          <label className="field-label">
            Client
          </label>

          <select
            name="clientid"
            required
            className="field-input"
          >
            <option value="">
              Select a client…
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

        {field("Project title", "title")}
        {field("Project location", "location")}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="field-label">
              Project type
            </label>

            <select
              name="type"
              className="field-input"
            >
              <option>Residential</option>
              <option>Commercial</option>
              <option>Institutional</option>
              <option>Other</option>
            </select>
          </div>

          {field(
            "Estimated value (₦)",
            "value",
            "number",
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {field(
            "Start date",
            "start",
            "date",
            false,
          )}

          {field(
            "Expected end date",
            "end",
            "date",
            false,
          )}
        </div>

        <div>
          <label className="field-label">
            Project Manager
          </label>

          <select
            name="manager"
            className="field-input"
            required
          >
            <option value="">
              Select Project Manager…
            </option>

            {managers.map((manager) => (
              <option
                key={manager.userid}
                value={manager.userid}
              >
                {manager.fullname}
                {manager.department
                  ? ` · ${manager.department}`
                  : ""}
              </option>
            ))}
          </select>

          <p className="mt-1 text-xs text-slate-500">
            The selected person is automatically assigned as the active Project Manager.
          </p>
        </div>
      </div>

      {message && (
        <p
          className={`mt-3 text-sm ${
            message.toLowerCase().includes("created")
              ? "text-emerald-600"
              : "text-red-600"
          }`}
        >
          {message}
        </p>
      )}

      <button
        disabled={
          saving ||
          !clients.length ||
          !managers.length
        }
        className="btn-primary mt-6 w-full"
      >
        {saving ? "Saving…" : "Create project"}
      </button>

      {!clients.length && (
        <p className="mt-2 text-xs text-amber-600">
          Create a client first.
        </p>
      )}

      {!managers.length && (
        <p className="mt-2 text-xs text-amber-600">
          Create and activate at least one staff account before creating a project.
        </p>
      )}
    </form>
  );
}
