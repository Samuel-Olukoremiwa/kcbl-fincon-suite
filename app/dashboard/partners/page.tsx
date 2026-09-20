import { BriefcaseBusiness, HardHat, Truck } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePageAccess } from "@/lib/viewer";
import PartnerForm from "./partner-form";
import PartnerDirectory from "./partner-directory";
import { canAccess } from "@/lib/access";

type PartnerType = "supplier" | "subcontractor";

type PartnersPageProps = {
  searchParams?: {
    type?: string;
  };
};

export default async function PartnersPage({
  searchParams,
}: PartnersPageProps) {
  const viewer = await requirePageAccess("suppliers");

  const s = createClient();

  const [{ data: suppliers }, { data: subcontractors }] = await Promise.all([
    s
      .from("suppliers")
      .select(
        "supplierid,suppliername,supplycategory,phonenumber,email,address,description,status",
      )
      .order("supplierid", { ascending: false }),

    s
      .from("subcontractors")
      .select(
        "subcontractorid,subcontractorname,tradespecialty,phonenumber,email,address,description,status",
      )
      .order("subcontractorid", { ascending: false }),
  ]);

  const rows = [
    ...(suppliers ?? []).map((x) => ({
      ...x,
      id: x.supplierid,
      name: x.suppliername,
      category: x.supplycategory,
      kind: "Supplier" as const,
    })),

    ...(subcontractors ?? []).map((x) => ({
      ...x,
      id: x.subcontractorid,
      name: x.subcontractorname,
      category: x.tradespecialty,
      kind: "Subcontractor" as const,
    })),
  ].sort((a, b) => b.id.localeCompare(a.id));

  const selectedType: PartnerType =
    searchParams?.type === "subcontractor"
      ? "subcontractor"
      : "supplier";

  const canCreateSupplier = canAccess(viewer, "suppliers", true);
  const canCreateSubcontractor = canAccess(viewer, "subcontractors", true);

  const canCreate =
    selectedType === "supplier"
      ? canCreateSupplier
      : canCreateSubcontractor;

  const selectedExistingIds =
    selectedType === "supplier"
      ? suppliers?.map((x) => x.supplierid) ?? []
      : subcontractors?.map((x) => x.subcontractorid) ?? [];

  return (
    <div>
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white">
          <BriefcaseBusiness size={20} />
        </div>

        <div>
          <h1 className="text-xl font-semibold">
            Suppliers & subcontractors
          </h1>

          <p className="text-sm text-slate-500">
            One directory of all external partners, identified by type.
          </p>
        </div>
      </header>

      {/* Supplier / Subcontractor toggle */}
      <div className="mt-6 flex">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1">
          <Link
            href="/dashboard/partners?type=supplier"
            className={`flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold transition ${
              selectedType === "supplier"
                ? "bg-white text-navy shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Truck size={16} />
            Suppliers
          </Link>

          <Link
            href="/dashboard/partners?type=subcontractor"
            className={`flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold transition ${
              selectedType === "subcontractor"
                ? "bg-white text-navy shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <HardHat size={16} />
            Subcontractors
          </Link>
        </div>
      </div>

      <div
        className={`mt-8 grid gap-6 ${
          canCreate ? "xl:grid-cols-[400px_1fr]" : ""
        }`}
      >
        {/* Only the selected partner form is displayed */}
        {canCreate && (
          <div className="card p-6">
            <PartnerForm
              kind={selectedType}
              existingIds={selectedExistingIds}
            />
          </div>
        )}

        <PartnerDirectory
          rows={rows}
          selectedKind={
            selectedType === "supplier"
              ? "Supplier"
              : "Subcontractor"
          }
        />
      </div>
    </div>
  );
}