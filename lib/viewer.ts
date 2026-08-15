import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Viewer = {
  userId: string;
  authUserId: string;
  fullName: string;
  userType: "Staff" | "Client";
  roleName: string;
};

export async function getViewer(): Promise<Viewer> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("users")
    .select("userid, fullname, usertype, roles(rolename)")
    .eq("authuserid", user.id)
    .single();
  if (!profile) redirect("/login?error=profile");
  const role = (profile.roles as unknown as { rolename: string } | null)?.rolename ?? "Unknown";
  return { userId: profile.userid, authUserId: user.id, fullName: profile.fullname, userType: profile.usertype as "Staff" | "Client", roleName: role };
}

export async function requireStaff() {
  const viewer = await getViewer();
  if (viewer.userType === "Client") redirect("/dashboard/portal");
  return viewer;
}
