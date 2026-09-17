import { ContactRound } from "lucide-react";
import { getViewer, requirePageAccess } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import AssignmentsWorkspace from "./workspace";

export default async function AssignmentsPage() {
  const viewer = await requirePageAccess("assignments"); const admin = createAdminClient();
  const all = viewer.department === "MD Office" || viewer.roleName === "Super User";
  const [{ data: projects }, { data: staff }, { data: assignments }] = await Promise.all([
    admin.from("projects").select("projectid,projecttitle,clients(fullnameorcompanyname)").order("projectid"),
    admin.from("users").select("userid,fullname,department").eq("usertype","Staff").eq("status","Active").order("fullname"),
    (all ? admin.from("projectassignments").select("assignmentid,projectid,userid,assignmentrole,approvalstatus,assignedat,projects(projecttitle),users(fullname)").order("assignedat",{ascending:false}) : admin.from("projectassignments").select("assignmentid,projectid,userid,assignmentrole,approvalstatus,assignedat,projects(projecttitle),users(fullname)").eq("assignedbyuserid",viewer.userId).order("assignedat",{ascending:false}))
  ]);
  return <div><header className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-white"><ContactRound size={20}/></div><div><h1 className="text-xl font-semibold">Project assignments</h1><p className="text-sm text-slate-500">Operations initiates by project code; MD Office authorizes access.</p></div></header><AssignmentsWorkspace projects={projects??[]} staff={staff??[]} assignments={assignments??[]} canCreate={viewer.department === "Operations"} canApprove={all}/></div>;
}
