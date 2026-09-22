import Link from "next/link";
import { UserPlus } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePageAccess } from "@/lib/viewer";
import {
  canCreateStaffSystemAccount,
  canEditStaffOnboarding,
} from "@/lib/staff-records";
import {
  ASSIGNABLE_STAFF_ROLES,
  SUPER_USER_ROLE,
} from "@/lib/roles";
import EditUserAccess from "./edit-user-access";
import ApproveUserButton from "./approve-user-button";
import PageHeader from "../page-header";

const ROLE_BADGE: Record<string, string> = {
  "Super User": "badge-brand",
  Initiator: "badge bg-navy-50 text-navy",
  Authorizer: "badge bg-navy-50 text-navy",
};

function onboardingBadge(status?: string | null) {
  if (status === "Account Created" || status === "Verified") {
    return "badge-success";
  }

  if (status === "Submitted") {
    return "badge-warning";
  }

  return "badge-neutral";
}

export default async function UsersPage() {
  const viewer = await requirePageAccess("users");
  const admin = createAdminClient();

  const isSuperUser = viewer.roleName === SUPER_USER_ROLE;
  const canOnboard = canEditStaffOnboarding(viewer);
  const canCreateAccount = canCreateStaffSystemAccount(viewer);

  const canApprove =
    isSuperUser ||
    (viewer.department === "MD Office" &&
      ["Authorizer", "MD Office"].includes(viewer.roleName));

  const canEditAccess = isSuperUser;

  const [{ data: users }, { data: roles }, { data: onboardings }] =
    await Promise.all([
      admin
        .from("users")
        .select(
          "userid,fullname,email,usertype,status,department,accesslevel,roleid,roles(rolename)",
        )
        .eq("usertype", "Staff")
        .order("userid"),

      admin.from("roles").select("roleid,rolename").order("rolename"),

      admin
        .from("staffonboarding")
        .select(
          "onboardingid,fullname,email,phonenumber,staffidassigned,employmentstatus,onboardingstatus,createduserid,createdat,updatedat",
        )
        .order("createdat", { ascending: false }),
    ]);

  const assignableRoleOptions = (roles ?? []).filter((role) =>
    (ASSIGNABLE_STAFF_ROLES as readonly string[]).includes(role.rolename),
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          icon={UserPlus}
          title="Users & Staff Database"
          description="Maintain personnel onboarding records separately from FinCon Suite login accounts."
        />

        {canOnboard && (
          <Link
            href="/dashboard/users/new"
            className="btn-primary inline-flex items-center gap-2"
          >
            <UserPlus size={16} />
            Onboard New Staff
          </Link>
        )}
      </div>

      <div className="mt-6 rounded-md border border-navy-100 bg-navy-50/40 p-4 text-sm text-slate-700">
        <b>New workflow:</b> onboard the staff member first, complete and verify
        the personnel record, then create a FinCon Suite user account only when
        system access is required. Existing user accounts remain unchanged.
      </div>

      <section className="card mt-8 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="font-semibold text-ink">Staff Database</h2>
            <p className="mt-1 text-sm text-slate-500">
              Personnel onboarding records exist independently of login access.
            </p>
          </div>

          <span className="badge-neutral">
            {(onboardings ?? []).length} staff record(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Staff</th>
                <th className="px-4 py-3 font-medium">Onboarding</th>
                <th className="px-4 py-3 font-medium">Employment</th>
                <th className="px-4 py-3 font-medium">System account</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {(onboardings ?? []).map((record) => {
                const initials = record.fullname
                  .split(" ")
                  .map((segment: string) => segment[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();

                const accountCreated = Boolean(record.createduserid);
                const readyForAccount =
                  record.onboardingstatus === "Verified" && !accountCreated;

                return (
                  <tr key={record.onboardingid} className="row-interactive">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-50 text-xs font-semibold text-navy">
                          {initials}
                        </div>

                        <div>
                          <p className="font-medium text-ink">{record.fullname}</p>
                          <p className="text-xs text-slate-400">
                            ONB{String(record.onboardingid).padStart(5, "0")} · {record.email}
                          </p>
                          {record.staffidassigned && (
                            <p className="text-xs text-slate-400">
                              Staff ID: {record.staffidassigned}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span className={onboardingBadge(record.onboardingstatus)}>
                        {record.onboardingstatus}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {record.employmentstatus ?? "Active"}
                    </td>

                    <td className="px-4 py-3">
                      {accountCreated ? (
                        <div>
                          <span className="badge-success">Account created</span>
                          <p className="mt-1 text-xs text-slate-400">
                            {record.createduserid}
                          </p>
                        </div>
                      ) : readyForAccount ? (
                        <span className="badge-warning">Ready to create</span>
                      ) : (
                        <span className="badge-neutral">Not created</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3">
                        {accountCreated ? (
                          <Link
                            href={`/dashboard/users/${record.createduserid}`}
                            className="text-sm font-medium text-navy hover:underline"
                          >
                            Open Staff Record
                          </Link>
                        ) : (
                          <Link
                            href={`/dashboard/users/onboarding/${record.onboardingid}`}
                            className="text-sm font-medium text-navy hover:underline"
                          >
                            {readyForAccount && canCreateAccount
                              ? "Review / Create Account"
                              : record.onboardingstatus === "Draft"
                                ? "Continue Onboarding"
                                : "Open Onboarding"}
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!onboardings?.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    No staff onboarding records yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card mt-8 overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-ink">FinCon Suite User Accounts</h2>
          <p className="mt-1 text-sm text-slate-500">
            Only staff who require access to the application need a system account.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Department / Role</th>
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {(users ?? []).map((user) => {
                const roleLabel =
                  (user.roles as unknown as { rolename: string } | null)?.rolename ??
                  "—";

                const initials = user.fullname
                  .split(" ")
                  .map((segment: string) => segment[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();

                return (
                  <tr key={user.userid} className="row-interactive">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-50 text-xs font-semibold text-navy">
                          {initials}
                        </div>

                        <div>
                          <p className="font-medium text-ink">{user.fullname}</p>
                          <p className="text-xs text-slate-400">
                            {user.userid} · {user.email ?? "No email"}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-700">
                        {user.department ?? "No department"}
                      </p>
                      <span className={ROLE_BADGE[roleLabel] ?? "badge-neutral"}>
                        {roleLabel}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={
                          "inline-flex items-center gap-1.5 " +
                          (user.status === "Active" ? "badge-success" : "badge-neutral")
                        }
                      >
                        <span
                          className={
                            "h-1.5 w-1.5 rounded-full " +
                            (user.status === "Active" ? "bg-green-500" : "bg-slate-400")
                          }
                        />
                        {user.status}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3">
                        <Link
                          href={`/dashboard/users/${user.userid}`}
                          className="text-sm font-medium text-navy hover:underline"
                        >
                          Staff record
                        </Link>

                        {canApprove && user.status === "Pending" && (
                          <ApproveUserButton userid={user.userid} />
                        )}

                        {canEditAccess && (
                          <EditUserAccess
                            userid={user.userid}
                            currentRoleId={user.roleid}
                            currentRoleName={roleLabel}
                            currentDepartment={user.department}
                            roleOptions={assignableRoleOptions}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!users?.length && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                    No staff system accounts yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
