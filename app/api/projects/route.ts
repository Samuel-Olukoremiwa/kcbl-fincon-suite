import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireApiWriteAccess } from "@/lib/viewer";
import { nextPrefixedId } from "@/lib/client-utils";

export async function POST(request: Request) {
  const { viewer, forbidden } = await requireApiWriteAccess("projects");
  if (forbidden || !viewer) {
    return NextResponse.json({ error: "Not authorized to create projects." }, { status: 403 });
  }
  if (viewer.roleName === "Authorizer") {
    return NextResponse.json({ error: "Authorizers cannot create new projects." }, { status: 403 });
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
    status: body.status,
    projectmanageruserid: body.manager || null,
    datecreated: new Date().toISOString().slice(0, 10),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ projectid });
}