import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/viewer";

export async function PATCH(request: Request, { params }: { params: { requestid: string } }) {
  const viewer = await getViewer();
  if (viewer.department !== "Audit/Internal Control") {
    return NextResponse.json({ error: "Only Internal Control can decide on this request." }, { status: 403 });
  }

  const { decision, comments } = await request.json();
  if (!["Approved", "Rejected"].includes(decision)) {
    return NextResponse.json({ error: "decision must be Approved or Rejected." }, { status: 400 });
  }

  const supabase = createClient();
  const { data: req, error: fetchError } = await supabase
    .from("sessiontimeoutrequests")
    .select("*")
    .eq("requestid", params.requestid)
    .single();
  if (fetchError || !req) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  if (req.status !== "Pending") return NextResponse.json({ error: "Already decided." }, { status: 400 });

  const admin = createAdminClient();

  if (decision === "Approved") {
    const { error } = await admin
      .from("systemsettings")
      .upsert({ settingkey: "session_timeout_minutes", settingvalue: req.requestedminutes, updatedbyuserid: viewer.userId, updatedat: new Date().toISOString() });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error } = await admin
    .from("sessiontimeoutrequests")
    .update({ status: decision, reviewedbyuserid: viewer.userId, reviewcomments: comments || null, reviewedat: new Date().toISOString() })
    .eq("requestid", params.requestid);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}