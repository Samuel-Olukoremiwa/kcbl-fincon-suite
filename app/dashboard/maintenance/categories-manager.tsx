"use client";
import { useEffect, useState } from "react";

type Category = { categoryid: number; categoryname: string; isinhouse: boolean; active: boolean };

export default function CategoriesManager({ canManage }: { canManage: boolean }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [isInHouse, setIsInHouse] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/transactions/categories");
    const result = await res.json();
    if (res.ok) setCategories(result.categories);
  }
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/transactions/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryname: name, isinhouse: isInHouse }),
    });
    const result = await res.json();
    setSaving(false);
    if (!res.ok) return setMessage(result.error);
    setName("");
    setMessage(`"${result.category.categoryname}" added.`);
    load();
  }

  async function deactivate(categoryid: number) {
    const res = await fetch("/api/transactions/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryid }),
    });
    if (res.ok) load();
  }

  return (
    <div className="mt-8">
      <p className="section-title">Transaction categories</p>
      <p className="mt-1 text-sm text-slate-500">
        These categories appear on the cash inflow and expenditure forms. In-house categories apply to internal transactions.
      </p>

      {canManage && (
        <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="field-label">New category name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required className="field-input w-64" placeholder="e.g. Fuel Allowance" />
          </div>
          <div>
            <label className="field-label">Applies to</label>
            <select value={isInHouse ? "in-house" : "project"} onChange={(e) => setIsInHouse(e.target.value === "in-house")} className="field-input">
              <option value="in-house">In-house transactions</option>
              <option value="project">Project expenditure</option>
            </select>
          </div>
          <button disabled={saving} className="btn-primary">{saving ? "Adding…" : "Add category"}</button>
        </form>
      )}
      {message && <p className="mt-3 text-sm text-slate-600">{message}</p>}

      <div className="card mt-6 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Applies to</th>
              {canManage && <th className="px-4 py-3">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {categories.map((c) => (
              <tr key={c.categoryid}>
                <td className="px-4 py-3">{c.categoryname}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-navy-50 px-2 py-1 text-xs text-navy">
                    {c.isinhouse ? "In-house" : "Project"}
                  </span>
                </td>
                {canManage && (
                  <td className="px-4 py-3">
                    <button onClick={() => deactivate(c.categoryid)} className="text-sm text-red-600 hover:underline">
                      Deactivate
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {!categories.length && (
              <tr><td colSpan={canManage ? 3 : 2} className="px-4 py-8 text-center text-slate-400">No categories yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}