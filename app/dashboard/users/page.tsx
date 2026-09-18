import { UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePageAccess } from "@/lib/viewer";
import { canAccess } from "@/lib/access";
import CreateUserForm from "./create-user-form";
import EditUserAccess from "./edit-user-access";
import ApproveUserButton from "./approve-user-button";

const ROLE_BADGE: Record<string, string> = {
  "Super User": "bg-amber-50 text-amber-600",
  Initiator: "bg-navy-50 text-navy",
  Authorizer: "bg-navy-50 text-navy",
  Client: "bg-slate-100 text-slate-600",
  Viewer: "bg-slate-100 text-slate-600",
};

export default async function UsersPage() {
  const viewer = await requirePageAccess("users");
  const canCreate = canAccess(viewer, "users", true);
  const canApprove =
    viewer.department === "MD Office" || viewer.roleName === "Super User";
  const canEditAccess = viewer.roleName === "Super User";
  // Only the approval authority receives the complete request list. Other
  // permitted departments retain their normal row-level scoped view.
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

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white">
          <UserPlus size={20} strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-ink">User Management</h1>
          <p className="text-sm text-slate-500">
            Submit staff-user requests and manage their approval status.
          </p>
        </div>
      </div>

      <div
        className={`mt-8 grid gap-6 ${canCreate ? "lg:grid-cols-[380px_1fr]" : "grid-cols-1"}`}
      >
        {canCreate && (
          <div className="card p-6">
            <h2 className="mb-4 text-sm font-semibold text-ink">
              Create a new user
            </h2>
            <CreateUserForm projects={projects ?? []} />
          </div>
        )}

        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users?.map((u) => {
                const roleLabel =
                  (u.roles as unknown as { rolename: string } | null)
                    ?.rolename ?? "—";
                const initials = u.fullname
                  .split(" ")
                  .map((s: string) => s[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();

                return (
                  <tr key={u.userid} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-50 text-xs font-semibold text-navy">
                          {initials}
                        </div>
                        <div>
                          <div className="font-medium text-ink">
                            {u.fullname}
                          </div>
                          <div className="text-xs text-slate-400">
                            {u.userid}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{u.email}</td>
                    <td className="px-4 py-3 text-slate-600">{u.usertype}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          "rounded-full px-2.5 py-0.5 text-xs font-medium " +
                          (ROLE_BADGE[roleLabel] ??
                            "bg-slate-100 text-slate-600")
                        }
                      >
                        {roleLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium " +
                          (u.status === "Active"
                            ? "bg-green-50 text-green-700"
                            : "bg-slate-100 text-slate-500")
                        }
                      >
                        <span
                          className={
                            "h-1.5 w-1.5 rounded-full " +
                            (u.status === "Active"
                              ? "bg-green-500"
                              : "bg-slate-400")
                          }
                        />
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {canApprove && u.status === "Pending" && (
                          <ApproveUserButton userid={u.userid} />
                        )}
                        {canEditAccess && (
                          <EditUserAccess
                            userid={u.userid}
                            currentRoleId={u.roleid}
                            currentRoleName={roleLabel}
                            currentDepartment={u.department}
                            currentAccessLevel={u.accesslevel}
                            roleOptions={roles ?? []}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!users?.length && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-slate-400"
                  >
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
