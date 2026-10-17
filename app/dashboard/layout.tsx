import Sidebar from "./sidebar";
import SignOutButton from "./sign-out-button";
import { getViewer } from "@/lib/viewer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import SessionTimeout from "./session-timeout";
import ThemeToggle from "@/app/theme-toggle";
import DashboardTools from "./dashboard-tools";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await getViewer();

  const supabase = createClient();
  const admin = createAdminClient();

  const [
    { data: setting },
    { data: reportAssignments },
  ] = await Promise.all([
    supabase
      .from("systemsettings")
      .select("settingvalue")
      .eq("settingkey", "session_timeout_minutes")
      .maybeSingle(),

    viewer.userType === "Staff"
      ? admin
          .from("projectassignments")
          .select("assignmentrole")
          .eq("userid", viewer.userId)
          .eq("approvalstatus", "Approved")
          .eq("active", true)
          .in("assignmentrole", [
            "Project Manager",
            "Senior Supervisor",
            "Junior Supervisor",
          ])
      : Promise.resolve({
          data: [] as { assignmentrole: string }[],
        }),
  ]);

  const timeoutMinutes =
    Number(setting?.settingvalue ?? 5);

  const assignmentRoles = new Set(
    (reportAssignments ?? []).map(
      (row) => row.assignmentrole,
    ),
  );

  const hasProjectManagerAccess =
    assignmentRoles.has("Project Manager");

  const hasProjectReportAccess =
    hasProjectManagerAccess ||
    assignmentRoles.has("Senior Supervisor") ||
    assignmentRoles.has("Junior Supervisor");

  const initials = viewer.fullName
    .split(" ")
    .map((value: string) => value[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <SessionTimeout minutes={timeoutMinutes}>
      <div className="flex min-h-screen bg-paper">
        <Sidebar
          roleName={viewer.roleName}
          userType={viewer.userType}
          department={viewer.department}
          accessLevel={viewer.accessLevel}
          hasProjectManagerAccess={hasProjectManagerAccess}
          hasProjectReportAccess={hasProjectReportAccess}
        />

        <div className="min-w-0 flex-1 md:ml-64">
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white py-3.5 pl-14 pr-4 md:px-8">
            <div />

            <div className="flex items-center gap-3">
              <DashboardTools viewer={viewer} />

              <ThemeToggle />

              <div className="text-right">
                <p className="text-sm font-medium leading-tight text-ink">
                  {viewer.fullName}
                </p>

                <p className="text-xs leading-tight text-slate-400">
                  {viewer.roleName}
                </p>
              </div>

              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-50 text-xs font-semibold text-navy">
                {initials}
              </div>

              <div className="ml-2 border-l border-slate-200 pl-4">
                <SignOutButton />
              </div>
            </div>
          </header>

          <main
            id="main-content"
            className="px-4 py-6 md:px-8 md:py-8"
          >
            {children}
          </main>
        </div>
      </div>
    </SessionTimeout>
  );
}
