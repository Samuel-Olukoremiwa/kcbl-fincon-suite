import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/viewer";

export async function GET() {
  const viewer = await requireStaff();
  const isSuperUser = viewer.roleName === "Super User";
  const isInternalControl = viewer.department === "Audit/Internal Control";
  if (!isSuperUser && !isInternalControl) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("archivebatches")
    .select("archiveid, financialyear, halfyear, archivedat, archivedbyuserid")
    .order("financialyear", { ascending: false })
    .order("halfyear", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ batches: data });
}

export async function POST(request: Request) {
  const viewer = await requireStaff();
  if (viewer.roleName !== "Super User") {
    return NextResponse.json({ error: "Only the Super User can archive records." }, { status: 403 });
  }

  const { financialyear, halfyear } = await request.json();
  if (![1, 2].includes(halfyear) || !Number.isInteger(financialyear)) {
    return NextResponse.json({ error: "Provide a valid financial year and half (1 or 2)." }, { status: 400 });
  }

  const supabase = createClient();

  const { data: batch, error: batchError } = await supabase
    .from("archivebatches")
    .insert({ financialyear, halfyear, archivedbyuserid: viewer.userId })
    .select("archiveid")
    .single();
  if (batchError) return NextResponse.json({ error: batchError.message }, { status: 400 });

  const archiveid = batch.archiveid;
  const startMonth = halfyear === 1 ? "01" : "07";
  const endMonth = halfyear === 1 ? "06" : "12";
  const endDay = halfyear === 1 ? "30" : "31";
  const rangeStart = `${financialyear}-${startMonth}-01`;
  const rangeEnd = `${financialyear}-${endMonth}-${endDay}`;

  const results = await Promise.all([
    supabase.from("clients").update({ archiveid }).is("archiveid", null).gte("declarationdate", rangeStart).lte("declarationdate", rangeEnd),
    supabase.from("projects").update({ archiveid }).is("archiveid", null).gte("datecreated", rangeStart).lte("datecreated", rangeEnd),
    supabase.from("suppliers").update({ archiveid }).is("archiveid", null).gte("datecreated", rangeStart).lte("datecreated", rangeEnd),
    supabase.from("subcontractors").update({ archiveid }).is("archiveid", null).gte("datecreated", rangeStart).lte("datecreated", rangeEnd),
    supabase.from("cashinflowreceivables").update({ archiveid }).is("archiveid", null).gte("transactiondate", rangeStart).lte("transactiondate", rangeEnd),
    supabase.from("cashoutflowexpenditure").update({ archiveid }).is("archiveid", null).gte("transactiondate", rangeStart).lte("transactiondate", rangeEnd),
  ]);

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return NextResponse.json({ archiveid, error: `Batch created, but some records failed to archive: ${failed.error.message}` }, { status: 207 });
  }

  return NextResponse.json({ archiveid });
}