import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, UserRound } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePageAccess } from "@/lib/viewer";
import {
  canCreateStaffSystemAccount,
  canEditSensitiveStaffData,
  canEditStaffOnboarding,
  canVerifyStaffOnboarding,
  canViewSensitiveStaffData,
  canViewStaffRecord,
} from "@/lib/staff-records";
import { SUPER_USER_ROLE } from "@/lib/roles";
import StaffOnboardingForm from "./staff-onboarding-form";
import CreateUserAccountPanel from "./create-user-account-panel";

export const dynamic = "force-dynamic";

export default async function StaffOnboardingRecordPage({
  params,
}: {
  params: { onboardingid: string };
}) {
  const viewer = await requirePageAccess("users");

  if (!canViewStaffRecord(viewer)) {
    redirect("/dashboard/users?error=forbidden");
  }

  const onboardingid = Number(params.onboardingid);

  if (!Number.isInteger(onboardingid) || onboardingid <= 0) {
    redirect("/dashboard/users?error=staff-onboarding-not-found");
  }

  const admin = createAdminClient();

  const [
    { data: onboarding },
    { data: references },
    { data: documents },
    { data: projects },
  ] = await Promise.all([
    admin
      .from("staffonboarding")
      .select("*")
      .eq("onboardingid", onboardingid)
      .maybeSingle(),
    admin
      .from("staffonboardingreferences")
      .select("*")
      .eq("onboardingid", onboardingid)
      .order("referencenumber"),
    admin
      .from("staffonboardingdocuments")
      .select(
        "documentid,onboardingid,documenttype,filename,mimetype,filesize,uploadedbyuserid,uploadedat,verified,verifiedbyuserid,verifiedat,verificationremarks",
      )
      .eq("onboardingid", onboardingid)
      .order("uploadedat", { ascending: false }),
    admin.from("projects").select("projectid,projecttitle").order("projectid"),
  ]);

  if (!onboarding) {
    redirect("/dashboard/users?error=staff-onboarding-not-found");
  }

  const canViewSensitive = canViewSensitiveStaffData(viewer);
  const canVerify = canVerifyStaffOnboarding(viewer);
  const accountCreated = Boolean(onboarding.createduserid);

  const visibleOnboarding: Record<string, any> = { ...onboarding };

  if (!canViewSensitive) {
    delete visibleOnboarding.bankname;
    delete visibleOnboarding.bankaccountname;
    delete visibleOnboarding.bankaccountnumber;
    delete visibleOnboarding.tin;
    delete visibleOnboarding.medicalresultgood;
    delete visibleOnboarding.adminremarks;
  }

  if (!canVerify) {
    delete visibleOnboarding.datereceived;
    delete visibleOnboarding.employmentletterissued;
    delete visibleOnboarding.staffidassigned;
    delete visibleOnboarding.ppeissued;
    delete visibleOnboarding.hseinductioncompleted;
    delete visibleOnboarding.stafffilecreated;
    delete visibleOnboarding.medicalresultgood;
    delete visibleOnboarding.adminremarks;
    delete visibleOnboarding.employmentstatus;
  }

  const visibleDocuments = canViewSensitive
    ? documents ?? []
    : (documents ?? []).filter(
        (document) => document.documenttype !== "Medical Result",
      );

  const canCreateAccount =
    canCreateStaffSystemAccount(viewer) &&
    onboarding.onboardingstatus === "Verified" &&
    !accountCreated;

  return (
    <div>
      <Link
        href="/dashboard/users"
        className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-navy hover:underline"
      >
        <ArrowLeft size={16} />
        Back to Users &amp; Staff Database
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white">
            <UserRound size={20} />
          </div>

          <div>
            <h1 className="text-xl font-semibold text-ink">{onboarding.fullname}</h1>
            <p className="text-sm text-slate-500">
              ONB{String(onboarding.onboardingid).padStart(5, "0")} · Staff onboarding record
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span
            className={
              onboarding.onboardingstatus === "Verified" ||
              onboarding.onboardingstatus === "Account Created"
                ? "badge-success"
                : onboarding.onboardingstatus === "Submitted"
                  ? "badge-warning"
                  : "badge-neutral"
            }
          >
            Onboarding: {onboarding.onboardingstatus}
          </span>

          <span className={accountCreated ? "badge-success" : "badge-neutral"}>
            System account: {accountCreated ? onboarding.createduserid : "Not created"}
          </span>
        </div>
      </header>

      <p className="mt-3 max-w-4xl text-sm text-slate-500">
        This is the personnel record. A FinCon Suite login is separate and is
        created only after the onboarding record has been verified and system
        access is required.
      </p>

      {accountCreated && (
        <div className="mt-6 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          A system account has already been created from this onboarding record.
          Future personnel updates should be made from the linked{" "}
          <Link
            href={`/dashboard/users/${onboarding.createduserid}`}
            className="font-semibold underline"
          >
            Staff Record
          </Link>
          .
        </div>
      )}

      <StaffOnboardingForm
        onboardingid={onboardingid}
        initialProfile={visibleOnboarding}
        initialReferences={references ?? []}
        initialDocuments={visibleDocuments}
        permissions={{
          canEditCore: canEditStaffOnboarding(viewer) && !accountCreated,
          canViewSensitive,
          canEditSensitive: canEditSensitiveStaffData(viewer) && !accountCreated,
          canVerify: canVerify && !accountCreated,
        }}
      />

      {canCreateAccount && (
        <div className="mt-8">
          <CreateUserAccountPanel
            onboardingid={onboardingid}
            staff={{
              fullname: onboarding.fullname,
              email: onboarding.email,
              phonenumber: onboarding.phonenumber,
            }}
            projects={projects ?? []}
            canAssignSuperUser={viewer.roleName === SUPER_USER_ROLE}
          />
        </div>
      )}
    </div>
  );
}
