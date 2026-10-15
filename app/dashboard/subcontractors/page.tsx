import { HardHat } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requirePageAccess } from "@/lib/viewer";
import PartnerForm from "../partners/partner-form";
import EditPartnerRequest from "../partners/edit-partner-request";
import DeletePartnerButton from "../partners/delete-partner-button";

function normalizeCategories(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  const single = String(value ?? "").trim();

  return single ? [single] : [];
}

export default async function SubcontractorsPage() {
  const viewer =
    await requirePageAccess("subcontractors");

  const supabase = createClient();

  const { data: rows } = await supabase
    .from("subcontractors")
    .select(
      "subcontractorid,subcontractorname,tradespecialty,phonenumber,email,address,description,status",
    )
    .order("subcontractorid", {
      ascending: false,
    });

  const canDelete =
    viewer.roleName === "Super User";

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
                (row) =>
                  row.subcontractorid,
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
                  Specialties
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
              {rows?.map((row) => {
                const categories =
                  normalizeCategories(
                    row.tradespecialty,
                  );

                return (
                  <tr
                    key={
                      row.subcontractorid
                    }
                  >
                    <td className="px-4 py-3">
                      <b>
                        {row.subcontractorname}
                      </b>

                      <span className="block text-xs text-slate-400">
                        {row.subcontractorid}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      {categories.join(", ") || "—"}
                    </td>

                    <td className="px-4 py-3">
                      {row.phonenumber}

                      <span className="block text-xs">
                        {row.email}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          row.status === "Active"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <EditPartnerRequest
                          kind="subcontractor"
                          entityid={
                            row.subcontractorid
                          }
                          partner={{
                            phonenumber:
                              row.phonenumber,
                            email: row.email,
                            address: row.address,
                            tradespecialty:
                              categories,
                            description:
                              row.description,
                          }}
                        />

                        {canDelete && (
                          <DeletePartnerButton
                            kind="subcontractor"
                            entityId={
                              row.subcontractorid
                            }
                            name={
                              row.subcontractorname
                            }
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

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
