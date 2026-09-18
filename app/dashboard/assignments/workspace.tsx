"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
  const r = useRouter(),
    [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [projectFilter, setProjectFilter] = useState("All projects");
  const [staffFilter, setStaffFilter] = useState("All staff");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const filteredAssignments = assignments.filter((assignment) => {
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
    const initiated = assignment.assignedat?.slice(0, 10) ?? "";
    return (
      matchesSearch &&
      (statusFilter === "All statuses" ||
        assignment.approvalstatus === statusFilter) &&
      (projectFilter === "All projects" ||
        assignment.projectid === projectFilter) &&
      (staffFilter === "All staff" || assignment.userid === staffFilter) &&
      (!fromDate || initiated >= fromDate) &&
      (!toDate || initiated <= toDate)
    );
  });
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // React may clear currentTarget after the awaited request. Keep the form
    // element itself so a successful submission can reset without crashing.
    const form = e.currentTarget;
    const f = new FormData(form);
    const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectid: f.get("projectid"),
          userid: f.get("userid"),
          assignmentrole: f.get("assignmentrole"),
        }),
      }),
      b = await res.json();
    setMessage(
      res.ok
        ? (b.message ?? "Assignment submitted for MD Office authorization.")
        : b.error,
    );
    if (res.ok) {
      form.reset();
      r.refresh();
    }
  }
  async function decide(id: number, decision: string) {
    const res = await fetch(`/api/assignments/${id}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      }),
      b = await res.json();
    setMessage(res.ok ? `Assignment ${decision.toLowerCase()}.` : b.error);
    if (res.ok) r.refresh();
  }
  return (
    <div
      className={`mt-7 grid gap-6 ${canCreate ? "xl:grid-cols-[380px_1fr]" : "grid-cols-1"}`}
    >
      {canCreate && (
        <form className="card p-6" onSubmit={create}>
          <h2 className="font-semibold">Assign by project code</h2>
          <p className="mt-1 text-sm text-slate-500">
            Only approved assignments grant project access.
          </p>
          <label className="mt-4 block">
            <span className="field-label">Project code</span>
            <select className="field-input" name="projectid" required>
              <option value="">Select project code…</option>
              {projects.map((p) => (
                <option key={p.projectid} value={p.projectid}>
                  {p.projectid} · {p.projecttitle}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-4 block">
            <span className="field-label">Staff member</span>
            <select className="field-input" name="userid" required>
              <option value="">Select staff…</option>
              {staff.map((u) => (
                <option key={u.userid} value={u.userid}>
                  {u.fullname} · {u.department ?? "No department"}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-4 block">
            <span className="field-label">Project role</span>
            <select className="field-input" name="assignmentrole">
              {ROLES.map((role) => (
                <option key={role}>{role}</option>
              ))}
            </select>
          </label>
          <button className="btn-primary mt-5 w-full">
            Submit for authorization
          </button>
        </form>
      )}
      <section className="card overflow-hidden">
        <div className="border-b p-5">
          <h2 className="font-semibold">Assignment register</h2>
          <p className="mt-1 text-sm text-slate-500">
            Pending, approved, and rejected assignment requests are retained
            here.
          </p>
          {message && <p className="mt-2 text-sm text-navy">{message}</p>}
        </div>
        <div className="grid gap-3 border-b bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-3">
          <input
            className="field-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search project, staff, role or authorizer…"
          />
          <select
            className="field-input"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option>All statuses</option>
            <option>Pending</option>
            <option>Approved</option>
            <option>Rejected</option>
          </select>
          <select
            className="field-input"
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
          >
            <option>All projects</option>
            {projects.map((project) => (
              <option key={project.projectid} value={project.projectid}>
                {project.projectid} · {project.projecttitle}
              </option>
            ))}
          </select>
          <select
            className="field-input"
            value={staffFilter}
            onChange={(event) => setStaffFilter(event.target.value)}
          >
            <option>All staff</option>
            {staff.map((person) => (
              <option key={person.userid} value={person.userid}>
                {person.fullname}
              </option>
            ))}
          </select>
          <label>
            <span className="field-label">Initiated from</span>
            <input
              className="field-input"
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </label>
          <label>
            <span className="field-label">Initiated to</span>
            <input
              className="field-input"
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </label>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Request history</th>
              {canApprove && <th className="px-4 py-3">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredAssignments.map((a) => (
              <tr key={a.assignmentid}>
                <td className="px-4 py-3">
                  <b>{a.projectid}</b>
                  <span className="block text-xs text-slate-400">
                    {a.projects?.projecttitle}
                  </span>
                </td>
                <td className="px-4 py-3">{a.users?.fullname}</td>
                <td className="px-4 py-3">{a.assignmentrole}</td>
                <td className="px-4 py-3 font-medium">{a.approvalstatus}</td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  Initiated {new Date(a.assignedat).toLocaleString("en-NG")}
                  <span className="mt-1 block">
                    {a.authorizedat
                      ? `${a.approvalstatus} by ${a.authorizerName ?? "MD Office"} · ${new Date(a.authorizedat).toLocaleString("en-NG")}`
                      : "Awaiting MD Office authorization"}
                  </span>
                </td>
                {canApprove && (
                  <td className="px-4 py-3">
                    {a.approvalstatus === "Pending" && (
                      <div className="flex gap-2">
                        <button
                          className="btn-primary"
                          onClick={() => decide(a.assignmentid, "Approved")}
                        >
                          Approve
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => decide(a.assignmentid, "Rejected")}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {!assignments.length && (
              <tr>
                <td
                  colSpan={canApprove ? 6 : 5}
                  className="px-4 py-10 text-center text-slate-400"
                >
                  No assignments match the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
