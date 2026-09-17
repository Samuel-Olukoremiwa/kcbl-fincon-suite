import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireApiWriteAccess } from "@/lib/viewer";
import { nextPrefixedId } from "@/lib/client-utils";
import { canCreateClientOrProject } from "@/lib/access";

export async function POST(request: Request) {
  const { viewer, forbidden } = await requireApiWriteAccess("projects");
  if (forbidden || !viewer || !canCreateClientOrProject(viewer)) {
    return NextResponse.json({ error: "Not authorized to create projects." }, { status: 403 });
  }

  const body = await request.json();
  const supabase = createClient();
  const { data: existing } = await supabase.from("projects").select("projectid");
  const projectid = nextPrefixedId((existing ?? []).map((x) => x.projectid), "PRJ", 5);

  const { error } = await supabase.from("projects").insert({
    projectid,
    clientid: body.clientid,
    projecttitle: body.title,
    projectlocation: body.location,
    projecttype: body.type,
    estimatedvalue: Number(body.value),
    startdate: body.start || null,
    expectedenddate: body.end || null,
    status: "Pending",
    projectmanageruserid: body.manager || null,
    datecreated: new Date().toISOString().slice(0, 10),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from("makercheckerauditlog").insert({
    logid: `LOG${Date.now().toString().slice(-9)}`,
    transactiontype: "Project", transactionid: projectid, actiontype: "Created",
    actionbyuserid: viewer.userId, actiondate: new Date().toISOString().slice(0, 10),
    actiontime: new Date().toTimeString().slice(0, 8), comments: body.title,
  });

  return NextResponse.json({ projectid });
}

export async function PATCH(request: Request) {
  const { viewer, forbidden } = await requireApiWriteAccess("projects");
  if (forbidden || !viewer || (viewer.department !== "MD Office" && viewer.roleName !== "Super User")) return NextResponse.json({ error: "Only MD Office or Super User may authorize a project status change." }, { status: 403 });
  const body = await request.json();
  const allowedStatuses = ["Ongoing", "Completed", "On Hold", "Pending"];
  if (!body.projectid || !allowedStatuses.includes(body.status)) return NextResponse.json({ error: "Choose a valid project status." }, { status: 400 });
  const supabase = createClient();
  const { error } = await supabase.from("projects").update({ status: body.status }).eq("projectid", body.projectid);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await supabase.from("makercheckerauditlog").insert({
    logid: `LOG${Date.now().toString().slice(-9)}`,
    transactiontype: "Project", transactionid: body.projectid, actiontype: "Status Updated",
    actionbyuserid: viewer.userId, actiondate: new Date().toISOString().slice(0, 10),
    actiontime: new Date().toTimeString().slice(0, 8), comments: `Status changed to ${body.status}`,
  });
  return NextResponse.json({ ok: true });
}
