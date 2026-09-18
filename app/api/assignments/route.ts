import { NextResponse } from "next/server";
import { getViewer } from "@/lib/viewer";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLES = [
  "Project Manager",
  "Senior Supervisor",
  "Junior Supervisor",
  "QS",
  "Site Engineer",
  "Operations Staff",
];
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (viewer.department !== "Operations")
    return NextResponse.json(
      { error: "Only Operations may initiate a project assignment." },
      { status: 403 },
    );
  const { projectid, userid, assignmentrole } = await request.json();
  if (!projectid || !userid || !ROLES.includes(assignmentrole))
    return NextResponse.json(
      {
        error: "Project code, staff member, and assignment role are required.",
      },
      { status: 400 },
    );
  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("projectid")
    .eq("projectid", projectid)
    .maybeSingle();
  if (!project)
    return NextResponse.json(
      { error: "Enter a valid project code." },
      { status: 404 },
    );
  const { data: existing, error: lookupError } = await admin
    .from("projectassignments")
    .select("assignmentid,approvalstatus")
    .eq("projectid", projectid)
    .eq("userid", userid)
    .eq("assignmentrole", assignmentrole)
    .maybeSingle();
  if (lookupError)
    return NextResponse.json({ error: lookupError.message }, { status: 400 });
  if (existing)
    return NextResponse.json({
      ok: true,
      existing: true,
      message: `This assignment already exists and is ${existing.approvalstatus.toLowerCase()}.`,
    });
  const { error } = await admin
    .from("projectassignments")
    .insert({
      projectid,
      userid,
      assignmentrole,
      assignedbyuserid: viewer.userId,
      approvalstatus: "Pending",
      active: false,
    });
  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json(
        {
          ok: true,
          message: "Assignment submitted for MD Office authorization.",
        },
        { status: 201 },
      );
}
