import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccess, type ModuleKey } from "@/lib/access";

export type Viewer = {
  userId: string;
  authUserId: string;
  fullName: string;
  userType: "Staff" | "Client";
  roleName: string;
  department: string | null;
  accessLevel: "Read & Write" | "Read Only";
};

export async function getViewer(): Promise<Viewer> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("userid, fullname, usertype, department, accesslevel, status, roles(rolename)")
    .eq("authuserid", user.id)
    .single();

  if (!profile) redirect("/login?error=profile");
  if (profile.status && profile.status !== "Active") redirect("/login?error=pending-approval");

  const role = (profile.roles as unknown as { rolename: string } | null)?.rolename ?? "Unknown";

  return {
    userId: profile.userid,
    authUserId: user.id,
    fullName: profile.fullname,
    userType: profile.usertype as "Staff" | "Client",
    roleName: role,
    department: profile.department ?? null,
    accessLevel: (profile.accesslevel ?? "Read Only") as "Read & Write" | "Read Only",
  };
}

export async function requireStaff() {
  const viewer = await getViewer();
  if (viewer.userType === "Client") redirect("/dashboard/portal");
  return viewer;
}

// Server-side page guard. Use at the top of any dashboard module page.tsx
// so direct URL navigation is blocked, not just hidden from the sidebar.
export async function requirePageAccess(module: ModuleKey, write = false) {
  const viewer = await requireStaff();
  if (!canAccess(viewer, module, write)) {
    redirect("/dashboard?error=forbidden");
  }
  return viewer;
}

// Server-side API guard. Use at the top of any route.ts handler that
// performs a write. Returns a Response to send back immediately if the
// caller isn't allowed to write, instead of redirecting (API routes
// can't redirect a fetch() call the way pages redirect a browser).
export async function requireApiWriteAccess(module: ModuleKey) {
  const viewer = await requireStaff();
  if (!canAccess(viewer, module, true)) {
    return { viewer: null, forbidden: true as const };
  }
  return { viewer, forbidden: false as const };
}
