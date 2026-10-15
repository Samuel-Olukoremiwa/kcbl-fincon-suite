import {
  BriefcaseBusiness,
  HardHat,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePageAccess } from "@/lib/viewer";
import PartnerForm from "./partner-form";
import PartnerDirectory from "./partner-directory";
import { canAccess } from "@/lib/access";

type PartnerType =
  | "supplier"
  | "subcontractor";

type PartnersPageProps = {
  searchParams?: {
    type?: string;
  };
};

function normalizeCategories(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  const single = String(value ?? "").trim();

  return single ? [single] : [];
}

export default async function PartnersPage({
  searchParams,
}: PartnersPageProps) {
  const viewer =
    await requirePageAccess("suppliers");

  const supabase = createClient();

  const [
    { data: suppliers },
    { data: subcontractors },
  ] = await Promise.all([
    supabase
      .from("suppliers")
      .select(
        "supplierid,suppliername,supplycategory,phonenumber,email,address,description,status",
      )
      .order("supplierid", {
        ascending: false,
      }),

    supabase
      .from("subcontractors")
      .select(
        "subcontractorid,subcontractorname,tradespecialty,phonenumber,email,address,description,status",
      )
      .order("subcontractorid", {
        ascending: false,
      }),
  ]);

  const rows = [
    ...(suppliers ?? []).map((supplier) => {
      const categories =
        normalizeCategories(
          supplier.supplycategory,
        );

      return {
        ...supplier,
        supplycategory: categories,
        id: supplier.supplierid,
        name: supplier.suppliername,
        category: categories,
        kind: "Supplier" as const,
      };
    }),

    ...(subcontractors ?? []).map(
      (subcontractor) => {
        const categories =
          normalizeCategories(
            subcontractor.tradespecialty,
          );

        return {
          ...subcontractor,
          tradespecialty: categories,
          id: subcontractor.subcontractorid,
          name:
            subcontractor.subcontractorname,
          category: categories,
          kind: "Subcontractor" as const,
        };
      },
    ),
  ].sort((left, right) =>
    right.id.localeCompare(left.id),
  );

  const selectedType: PartnerType =
    searchParams?.type === "subcontractor"
      ? "subcontractor"
      : "supplier";

  const canCreateSupplier = canAccess(
    viewer,
    "suppliers",
    true,
  );

  const canCreateSubcontractor = canAccess(
    viewer,
    "subcontractors",
    true,
  );

  const canCreate =
    selectedType === "supplier"
      ? canCreateSupplier
      : canCreateSubcontractor;

  const canDelete =
    viewer.roleName === "Super User";

  const selectedExistingIds =
    selectedType === "supplier"
      ? suppliers?.map(
          (supplier) => supplier.supplierid,
        ) ?? []
      : subcontractors?.map(
          (subcontractor) =>
            subcontractor.subcontractorid,
        ) ?? [];

  return (
    <div>
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white">
          <BriefcaseBusiness size={20} />
        </div>

        <div>
          <h1 className="text-xl font-semibold">
            Suppliers &amp; subcontractors
          </h1>

          <p className="text-sm text-slate-500">
            One directory of all external partners, identified by type.
          </p>
        </div>
      </header>

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
          canCreate
            ? "xl:grid-cols-[400px_1fr]"
            : ""
        }`}
      >
        {canCreate && (
          <div className="card p-6">
            <PartnerForm
              kind={selectedType}
              existingIds={
                selectedExistingIds
              }
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
          canDelete={canDelete}
        />
      </div>
    </div>
  );
}
