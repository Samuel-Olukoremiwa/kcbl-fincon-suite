import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, UserRound } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePageAccess } from "@/lib/viewer";
import {
  canEditSensitiveStaffData,
  canEditStaffOnboarding,
  canVerifyStaffOnboarding,
  canViewSensitiveStaffData,
  canViewStaffRecord,
} from "@/lib/staff-records";
import StaffProfileForm from "./staff-profile-form";

export const dynamic = "force-dynamic";

export default async function StaffRecordPage({
  params,
}: {
  params: {
    userid: string;
  };
}) {
  const viewer =
    await requirePageAccess(
      "users",
    );

  if (
    !canViewStaffRecord(
      viewer,
    )
  ) {
    redirect(
      "/dashboard/users?error=forbidden",
    );
  }

  const admin =
    createAdminClient();

  const {
    data: user,
  } = await admin
    .from("users")
    .select(
      "userid,fullname,email,phonenumber,department,status,usertype,roleid,roles(rolename)",
    )
    .eq(
      "userid",
      params.userid,
    )
    .maybeSingle();

  if (
    !user ||
    user.usertype !==
      "Staff"
  ) {
    redirect(
      "/dashboard/users?error=staff-not-found",
    );
  }

  await admin
    .from(
      "staffprofiles",
    )
    .upsert({
      userid:
        params.userid,
    });

  const [
    {
      data: profile,
    },
    {
      data: references,
    },
    {
      data: documents,
    },
  ] = await Promise.all([
    admin
      .from(
        "staffprofiles",
      )
      .select("*")
      .eq(
        "userid",
        params.userid,
      )
      .single(),

    admin
      .from(
        "staffreferences",
      )
      .select("*")
      .eq(
        "userid",
        params.userid,
      )
      .order(
        "referencenumber",
      ),

    admin
      .from(
        "staffdocuments",
      )
      .select(
        "documentid,userid,documenttype,filename,mimetype,filesize,uploadedbyuserid,uploadedat,verified,verifiedbyuserid,verifiedat,verificationremarks",
      )
      .eq(
        "userid",
        params.userid,
      )
      .order(
        "uploadedat",
        {
          ascending: false,
        },
      ),
  ]);

  const roleName =
    (
      user.roles as unknown as {
        rolename: string;
      } | null
    )?.rolename ??
    "—";

  const canViewSensitive =
    canViewSensitiveStaffData(
      viewer,
    );

  const canVerify =
    canVerifyStaffOnboarding(
      viewer,
    );

  const visibleProfile:
    Record<
      string,
      any
    > = {
    ...(profile ?? {
      userid:
        user.userid,
    }),
  };

  if (
    !canViewSensitive
  ) {
    delete visibleProfile.bankname;
    delete visibleProfile.bankaccountname;
    delete visibleProfile.bankaccountnumber;
    delete visibleProfile.tin;
    delete visibleProfile.medicalresultgood;
    delete visibleProfile.adminremarks;
  }

  if (
    !canVerify
  ) {
    delete visibleProfile.datereceived;
    delete visibleProfile.employmentletterissued;
    delete visibleProfile.staffidassigned;
    delete visibleProfile.ppeissued;
    delete visibleProfile.hseinductioncompleted;
    delete visibleProfile.stafffilecreated;
    delete visibleProfile.medicalresultgood;
    delete visibleProfile.adminremarks;
    delete visibleProfile.employmentstatus;
  }

  const visibleDocuments =
    canViewSensitive
      ? documents ?? []
      : (
          documents ??
          []
        ).filter(
          (
            document,
          ) =>
            document.documenttype !==
            "Medical Result",
        );

  return (
    <div>
      <Link
        href="/dashboard/users"
        className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-navy hover:underline"
      >
        <ArrowLeft
          size={16}
        />

        Back to User Management
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white">
            <UserRound
              size={20}
            />
          </div>

          <div>
            <h1 className="text-xl font-semibold">
              {
                user.fullname
              }
            </h1>

            <p className="text-sm text-slate-500">
              {
                user.userid
              }{" "}
              ·{" "}
              {user.department ??
                "No department"}{" "}
              ·{" "}
              {
                roleName
              }
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="badge-neutral">
            Account:{" "}
            {
              user.status
            }
          </span>

          <span
            className={
              profile?.onboardingstatus ===
              "Verified"
                ? "badge-success"
                : profile?.onboardingstatus ===
                    "Submitted"
                  ? "badge-warning"
                  : "badge-neutral"
            }
          >
            Onboarding:{" "}
            {profile?.onboardingstatus ??
              "Draft"}
          </span>
        </div>
      </header>

      <p className="mt-3 max-w-4xl text-sm text-slate-500">
        This personnel record stores the staff onboarding information,
        references, supporting documents, employment administration and system
        account details in one place.
      </p>

      <StaffProfileForm
        user={{
          userid:
            user.userid,

          fullname:
            user.fullname,

          email:
            user.email,

          phonenumber:
            user.phonenumber,

          department:
            user.department,

          status:
            user.status,

          roleName,
        }}
        initialProfile={
          visibleProfile
        }
        initialReferences={
          references ??
          []
        }
        initialDocuments={
          visibleDocuments
        }
        permissions={{
          canEditCore:
            canEditStaffOnboarding(
              viewer,
            ),

          canViewSensitive,

          canEditSensitive:
            canEditSensitiveStaffData(
              viewer,
            ),

          canVerify,
        }}
      />
    </div>
  );
}