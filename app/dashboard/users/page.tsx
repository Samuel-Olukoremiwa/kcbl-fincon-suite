import Link from "next/link";
import { UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePageAccess } from "@/lib/viewer";
import { canAccess } from "@/lib/access";
import {
  ASSIGNABLE_STAFF_ROLES,
  SUPER_USER_ROLE,
} from "@/lib/roles";
import CreateUserForm from "./create-user-form";
import EditUserAccess from "./edit-user-access";
import ApproveUserButton from "./approve-user-button";
import PageHeader from "../page-header";

const ROLE_BADGE: Record<string, string> = {
  "Super User": "badge-brand",
  Initiator: "badge bg-navy-50 text-navy",
  Authorizer: "badge bg-navy-50 text-navy",
  Client: "badge-neutral",
};

function onboardingBadge(status?: string | null) {
  if (status === "Verified") return "badge-success";
  if (status === "Submitted") return "badge-warning";
  return "badge-neutral";
}

export default async function UsersPage() {
  const viewer = await requirePageAccess("users");

  const canCreate = canAccess(viewer, "users", true);
  const isSuperUser = viewer.roleName === SUPER_USER_ROLE;

  const canApprove =
    isSuperUser ||
    (viewer.department === "MD Office" &&
      ["Authorizer", "MD Office"].includes(viewer.roleName));

  const canEditAccess = isSuperUser;

  // Approval authorities need the complete request list. Other permitted
  // departments retain their normal row-level scoped view.
  const supabase = canApprove ? createAdminClient() : createClient();

  const [{ data: users }, { data: roles }, { data: projects }] =
    await Promise.all([
      supabase
        .from("users")
        .select(
          "userid, fullname, email, usertype, status, department, accesslevel, roleid, roles(rolename)",
        )
        .order("userid"),

      supabase.from("roles").select("roleid, rolename").order("rolename"),

      supabase
        .from("projects")
        .select("projectid, projecttitle")
        .order("projectid"),
    ]);

  const staffUserIds = (users ?? [])
    .filter((user) => user.usertype === "Staff")
    .map((user) => user.userid);

  let staffProfiles: {
    userid: string;
    onboardingstatus: string;
    staffidassigned: string | null;
    employmentstatus: string;
  }[] = [];

  if (staffUserIds.length > 0) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("staffprofiles")
      .select("userid,onboardingstatus,staffidassigned,employmentstatus")
      .in("userid", staffUserIds);
    staffProfiles = data ?? [];
  }

  const staffProfileByUser = new Map(
    staffProfiles.map((profile) => [profile.userid, profile]),
  );

  const assignableRoleOptions = (roles ?? []).filter((role) =>
    (ASSIGNABLE_STAFF_ROLES as readonly string[]).includes(role.rolename),
  );

  return (
    <div>
      <PageHeader
        icon={UserPlus}
        title="User Management & Staff Database"
        description="Create staff accounts, manage access, and maintain official personnel/onboarding records."
      />

      <div
        className={`mt-8 grid gap-6 ${
          canCreate ? "lg:grid-cols-[380px_1fr]" : "grid-cols-1"
        }`}
      >
        {canCreate && (
          <div className="card p-6">
            <h2 className="mb-4 text-sm font-semibold text-ink">
              Register a staff user
            </h2>
            <CreateUserForm
              projects={projects ?? []}
              canAssignSuperUser={isSuperUser}
            />
            <p className="mt-4 rounded-md bg-slate-50 p-3 text-xs text-slate-500">
              After creating the account request, open the staff record to
              complete personal, professional, emergency, PPE, references and
              supporting-document information.
            </p>
          </div>
        )}

        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Department / Role</th>
                <th className="px-4 py-3 font-medium">Personnel record</th>
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users?.map((user) => {
                const roleLabel =
                  (user.roles as unknown as { rolename: string } | null)
                    ?.rolename ?? "—";

                const initials = user.fullname
                  .split(" ")
                  .map((segment: string) => segment[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();

                const isClientAccount = user.usertype === "Client";
                const staffProfile = staffProfileByUser.get(user.userid);

                return (
                  <tr key={user.userid} className="row-interactive">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-50 text-xs font-semibold text-navy">
                          {initials}
                        </div>
                        <div>
                          <div className="font-medium text-ink">
                            {user.fullname}
                          </div>
                          <div className="text-xs text-slate-400">
                            {user.userid} · {user.email ?? "No email"}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      {isClientAccount ? (
                        <span className="badge-neutral">Client</span>
                      ) : (
                        <div>
                          <p className="text-sm text-slate-700">
                            {user.department ?? "No department"}
                          </p>
                          <span className={ROLE_BADGE[roleLabel] ?? "badge-neutral"}>
                            {roleLabel}
                          </span>
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {isClientAccount ? (
                        <span className="text-xs text-slate-400">
                          Managed through Clients &amp; KYC
                        </span>
                      ) : (
                        <div>
                          <span className={onboardingBadge(staffProfile?.onboardingstatus)}>
                            {staffProfile?.onboardingstatus ?? "Draft"}
                          </span>
                          <p className="mt-1 text-xs text-slate-400">
                            {staffProfile?.staffidassigned
                              ? `Staff ID: ${staffProfile.staffidassigned}`
                              : staffProfile?.employmentstatus ?? "Active"}
                          </p>
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={
                          "inline-flex items-center gap-1.5 " +
                          (user.status === "Active"
                            ? "badge-success"
                            : "badge-neutral")
                        }
                      >
                        <span
                          className={
                            "h-1.5 w-1.5 rounded-full " +
                            (user.status === "Active"
                              ? "bg-green-500"
                              : "bg-slate-400")
                          }
                        />
                        {user.status}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3">
                        {!isClientAccount && (
                          <Link
                            href={`/dashboard/users/${user.userid}`}
                            className="text-sm font-medium text-navy hover:underline"
                          >
                            Staff record
                          </Link>
                        )}

                        {canApprove &&
                          user.status === "Pending" &&
                          !isClientAccount && (
                            <ApproveUserButton userid={user.userid} />
                          )}

                        {canEditAccess && !isClientAccount && (
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
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    No users yet.
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
