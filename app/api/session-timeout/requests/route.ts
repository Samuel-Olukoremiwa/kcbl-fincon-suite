import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export async function GET() {
  const viewer = await getViewer();
  if (viewer.department !== "Audit/Internal Control") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sessiontimeoutrequests")
    .select("*")
    .eq("status", "Pending")
    .order("requestedat", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (viewer.roleName !== "Super User") {
    return NextResponse.json({ error: "Only the Super User can request a session timeout change." }, { status: 403 });
  }
  const { minutes } = await request.json();
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) {
    return NextResponse.json({ error: "Minutes must be an integer between 1 and 120." }, { status: 400 });
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("sessiontimeoutrequests")
    .insert({ requestedminutes: minutes, requestedbyuserid: viewer.userId });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true }, { status: 201 });
}