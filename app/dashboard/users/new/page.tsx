import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, UserPlus } from "lucide-react";
import { requirePageAccess } from "@/lib/viewer";
import { canEditStaffOnboarding } from "@/lib/staff-records";
import PageHeader from "../../page-header";
import NewStaffOnboardingForm from "./new-staff-onboarding-form";

export const dynamic = "force-dynamic";

export default async function OnboardNewStaffPage() {
  const viewer = await requirePageAccess("users");

  if (!canEditStaffOnboarding(viewer)) {
    redirect("/dashboard/users?error=forbidden");
  }

  return (
    <div>
      <Link
        href="/dashboard/users"
        className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-navy hover:underline"
      >
        <ArrowLeft size={16} />
        Back to Users &amp; Staff Database
      </Link>

      <PageHeader
        icon={UserPlus}
        title="Onboard New Staff"
        description="Create the personnel record first. A FinCon Suite login can be created later after onboarding is verified."
      />

      <div className="mt-8 max-w-2xl">
        <div className="card p-6">
          <div className="mb-6 rounded-md border border-navy-100 bg-navy-50/40 p-4">
            <p className="text-sm font-semibold text-ink">How this works</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Start with the staff member&apos;s basic identity details. The system
              will create a Draft personnel record and take you to the full
              onboarding form. No login account is created at this stage.
            </p>
          </div>

          <NewStaffOnboardingForm />
        </div>
      </div>
    </div>
  );
}
