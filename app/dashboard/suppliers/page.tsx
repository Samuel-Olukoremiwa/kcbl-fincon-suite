import { Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePageAccess } from "@/lib/viewer";
import PartnerForm from "../partners/partner-form";
import EditPartnerRequest from "../partners/edit-partner-request";

export default async function SuppliersPage() {
  await requirePageAccess("suppliers");

  const s = createClient();

  const { data: rows } = await s
    .from("suppliers")
    .select(
      "supplierid,suppliername,supplycategory,phonenumber,email,address,description,status",
    )
    .order("supplierid", { ascending: false });

  return (
    <div>
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white">
          <Truck size={20} />
        </div>

        <div>
          <h1 className="text-xl font-semibold">
            Suppliers
          </h1>

          <p className="text-sm text-slate-500">
            Internal supplier records and payment details.
          </p>
        </div>
      </header>

      <div className="mt-8 grid gap-6 xl:grid-cols-[400px_1fr]">
        <div className="card p-6">
          <PartnerForm
            kind="supplier"
            existingIds={
              rows?.map((x) => x.supplierid)
            }
          />
        </div>

        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">
                  Supplier
                </th>
                <th className="px-4 py-3">
                  Category
                </th>
                <th className="px-4 py-3">
                  Contact
                </th>
                <th className="px-4 py-3">
                  Status
                </th>
                <th className="px-4 py-3">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {rows?.map((r) => (
                <tr key={r.supplierid}>
                  <td className="px-4 py-3">
                    <b>{r.suppliername}</b>

                    <span className="block text-xs text-slate-400">
                      {r.supplierid}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    {r.supplycategory}
                  </td>

                  <td className="px-4 py-3">
                    {r.phonenumber}

                    <span className="block text-xs">
                      {r.email}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        r.status === "Active"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <EditPartnerRequest
                      kind="supplier"
                      entityid={r.supplierid}
                      partner={{
                        phonenumber:
                          r.phonenumber,
                        email: r.email,
                        address: r.address,
                        supplycategory:
                          r.supplycategory,
                        description:
                          r.description,
                      }}
                    />
                  </td>
                </tr>
              ))}

              {!rows?.length && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-slate-400"
                  >
                    No suppliers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}