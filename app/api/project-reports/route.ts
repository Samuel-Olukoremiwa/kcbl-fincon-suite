import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import { canManageProjectReports } from "@/lib/access";

export async function GET() {
  const viewer = await getViewer();
  const admin = createAdminClient();
  let projectIds: string[] | null = null;
  if (viewer.userType === "Client") {
    const { data: client } = await admin.from("clients").select("clientid").eq("linkeduserid", viewer.userId).maybeSingle();
    if (!client) return NextResponse.json([]);
    const { data: projects } = await admin.from("projects").select("projectid").eq("clientid", client.clientid);
    projectIds = (projects ?? []).map((project) => project.projectid);
  } else if (!canManageProjectReports(viewer) && viewer.roleName !== "Super User") {
    return NextResponse.json({ error: "Not permitted to view project reports." }, { status: 403 });
  }
  if (projectIds && projectIds.length === 0) return NextResponse.json([]);
  let query = admin.from("projectreports").select("reportid,projectid,reportmonth,filename,filesize,uploadedat,clientnotifiedat,projects(projecttitle,clientid),users!projectreports_uploadedbyuserid_fkey(fullname)").order("reportmonth", { ascending: false }).order("uploadedat", { ascending: false });
  if (projectIds) query = query.in("projectid", projectIds);
  const { data, error } = await query;
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json(data ?? []);
}
