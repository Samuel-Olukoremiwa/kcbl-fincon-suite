import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(request: Request, { params }: { params: { reportid: string } }) {
  const viewer = await getViewer(); const { progresspct, comments, decision } = await request.json();
  if (viewer.department !== "Operations") return NextResponse.json({ error: "Only Operations may review a progress report." }, { status: 403 });
  if (!Number.isFinite(Number(progresspct)) || Number(progresspct) < 0 || Number(progresspct) > 100) return NextResponse.json({ error: "Progress percentage between 0 and 100 is required." }, { status: 400 });
  const admin=createAdminClient(); const { data: report }=await admin.from("projectreports").select("projectid,reviewstatus").eq("reportid",params.reportid).maybeSingle();
  if (!report || report.reviewstatus!=="Submitted") return NextResponse.json({error:"Report is not awaiting supervisor review."},{status:400});
  const {data: assignment}=await admin.from("projectassignments").select("assignmentid").eq("projectid",report.projectid).eq("userid",viewer.userId).eq("approvalstatus","Approved").eq("active",true).in("assignmentrole",["Project Manager","Senior Supervisor","Junior Supervisor"]).maybeSingle();
  if(!assignment)return NextResponse.json({error:"You are not an approved supervisor for this project."},{status:403});
  const next=decision==="Rejected"?"Rejected":"Reviewed"; const {error}=await admin.from("projectreports").update({reviewstatus:next,progresspct:Number(progresspct),supervisorcomments:comments||null,supervisorreviewedbyuserid:viewer.userId,supervisorreviewedat:new Date().toISOString()}).eq("reportid",params.reportid);
  return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({ok:true});
}
