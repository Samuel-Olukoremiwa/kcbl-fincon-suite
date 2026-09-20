import { HardHat } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePageAccess } from "@/lib/viewer";
import PartnerForm from "../partners/partner-form";
import EditPartnerRequest from "../partners/edit-partner-request";

export default async function SubcontractorsPage() {
  await requirePageAccess("subcontractors");

  const s = createClient();

  const { data: rows } = await s
    .from("subcontractors")
    .select(
      "subcontractorid,subcontractorname,tradespecialty,phonenumber,email,address,description,status",
    )
    .order("subcontractorid", {
      ascending: false,
    });

  return (
    <div>
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white">
          <HardHat size={20} />
        </div>

        <div>
          <h1 className="text-xl font-semibold">
            Subcontractors
          </h1>

          <p className="text-sm text-slate-500">
            Internal subcontractor records and bank details.
          </p>
        </div>
      </header>

      <div className="mt-8 grid gap-6 xl:grid-cols-[400px_1fr]">
        <div className="card p-6">
          <PartnerForm
            kind="subcontractor"
            existingIds={
              rows?.map(
                (x) => x.subcontractorid,
              )
            }
          />
        </div>

        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">
                  Subcontractor
                </th>
                <th className="px-4 py-3">
                  Specialty
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
                <tr
                  key={r.subcontractorid}
                >
                  <td className="px-4 py-3">
                    <b>
                      {r.subcontractorname}
                    </b>

                    <span className="block text-xs text-slate-400">
                      {r.subcontractorid}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    {r.tradespecialty}
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
                      kind="subcontractor"
                      entityid={
                        r.subcontractorid
                      }
                      partner={{
                        phonenumber:
                          r.phonenumber,
                        email: r.email,
                        address: r.address,
                        tradespecialty:
                          r.tradespecialty,
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
                    No subcontractors yet.
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