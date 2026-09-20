import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/viewer";

function canSubmit(viewer: Awaited<ReturnType<typeof requireStaff>>) {
  return viewer.department === "Audit/Internal Control";
}

function canFinanceReview(
  viewer: Awaited<ReturnType<typeof requireStaff>>,
) {
  return viewer.department === "Finance & Admin";
}

function canMdReview(viewer: Awaited<ReturnType<typeof requireStaff>>) {
  return viewer.department === "MD Office";
}

export async function GET() {
  const viewer = await requireStaff();

  const allowed =
    viewer.roleName === "Super User" ||
    viewer.department === "Audit/Internal Control" ||
    viewer.department === "Finance & Admin" ||
    viewer.department === "MD Office";

  if (!allowed) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const supabase = createClient();

  const [
    { data: batches, error: batchesError },
    { data: requests, error: requestsError },
    { data: restorations, error: restorationsError },
  ] = await Promise.all([
    supabase
      .from("archivebatches")
      .select(
        "archiveid,financialyear,halfyear,archivedat,archivedbyuserid",
      )
      .order("financialyear", { ascending: false })
      .order("halfyear", { ascending: false }),

    supabase
      .from("archiverequests")
      .select(
        "requestid,financialyear,halfyear,requestedbyuserid,requestedat,financereviewedbyuserid,financereviewedat,financeremarks,mdreviewedbyuserid,mdreviewedat,mdremarks,status,archiveid",
      )
      .order("requestedat", { ascending: false }),

    supabase
      .from("archiverestorationrequests")
      .select(
        "requestid,archiveid,requestedbyuserid,requestedat,financereviewedbyuserid,financereviewedat,financeremarks,mdreviewedbyuserid,mdreviewedat,mdremarks,status,restoredat",
      )
      .order("requestedat", { ascending: false }),
  ]);

  if (batchesError) {
    return NextResponse.json(
      { error: batchesError.message },
      { status: 400 },
    );
  }

  if (requestsError) {
    return NextResponse.json(
      { error: requestsError.message },
      { status: 400 },
    );
  }

  if (restorationsError) {
    return NextResponse.json(
      { error: restorationsError.message },
      { status: 400 },
    );
  }

  return NextResponse.json({
    batches: batches ?? [],
    requests: requests ?? [],
    restorations: restorations ?? [],
    permissions: {
      canSubmit: canSubmit(viewer),
      canFinanceReview: canFinanceReview(viewer),
      canMdReview: canMdReview(viewer),
    },
  });
}

export async function POST(request: Request) {
  const viewer = await requireStaff();
  const body = await request.json();

  const action = String(body.action ?? "");
  const supabase = createClient();

  try {
    if (action === "submit") {
      if (!canSubmit(viewer)) {
        return NextResponse.json(
          { error: "Only Audit/Internal Control can submit archive requests." },
          { status: 403 },
        );
      }

      const financialyear = Number(body.financialyear);
      const halfyear = Number(body.halfyear);

      if (
        !Number.isInteger(financialyear) ||
        ![1, 2].includes(halfyear)
      ) {
        return NextResponse.json(
          { error: "Provide a valid financial year and half-year." },
          { status: 400 },
        );
      }

      const { data, error } = await supabase.rpc(
        "submit_archive_request",
        {
          p_financialyear: financialyear,
          p_halfyear: halfyear,
          p_userid: viewer.userId,
        },
      );

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 },
        );
      }

      return NextResponse.json({
        ok: true,
        requestid: data,
      });
    }

    if (action === "finance-review") {
      if (!canFinanceReview(viewer)) {
        return NextResponse.json(
          { error: "Only Finance & Admin can review archive requests." },
          { status: 403 },
        );
      }

      const requestid = String(body.requestid ?? "");
      const approved = Boolean(body.approved);
      const comments =
        body.comments == null ? null : String(body.comments).trim();

      if (!requestid) {
        return NextResponse.json(
          { error: "Archive request ID is required." },
          { status: 400 },
        );
      }

      if (!approved && !comments) {
        return NextResponse.json(
          { error: "A rejection reason is required." },
          { status: 400 },
        );
      }

      const { error } = await supabase.rpc(
        "review_archive_request",
        {
          p_requestid: requestid,
          p_userid: viewer.userId,
          p_approved: approved,
          p_comments: comments,
        },
      );

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 },
        );
      }

      return NextResponse.json({ ok: true });
    }

    if (action === "md-review") {
      if (!canMdReview(viewer)) {
        return NextResponse.json(
          { error: "Only MD Office can perform final archive approval." },
          { status: 403 },
        );
      }

      const requestid = String(body.requestid ?? "");
      const approved = Boolean(body.approved);
      const comments =
        body.comments == null ? null : String(body.comments).trim();

      if (!requestid) {
        return NextResponse.json(
          { error: "Archive request ID is required." },
          { status: 400 },
        );
      }

      if (!approved && !comments) {
        return NextResponse.json(
          { error: "A rejection reason is required." },
          { status: 400 },
        );
      }

      const { data, error } = await supabase.rpc(
        "finalize_archive_request",
        {
          p_requestid: requestid,
          p_userid: viewer.userId,
          p_approved: approved,
          p_comments: comments,
        },
      );

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 },
        );
      }

      return NextResponse.json({
        ok: true,
        archiveid: data,
      });
    }

    if (action === "restore-submit") {
      if (!canSubmit(viewer)) {
        return NextResponse.json(
          {
            error:
              "Only Audit/Internal Control can submit restoration requests.",
          },
          { status: 403 },
        );
      }

      const archiveid = Number(body.archiveid);

      if (!Number.isInteger(archiveid) || archiveid <= 0) {
        return NextResponse.json(
          { error: "A valid archive ID is required." },
          { status: 400 },
        );
      }

      const { data, error } = await supabase.rpc(
        "submit_archive_restoration",
        {
          p_archiveid: archiveid,
          p_userid: viewer.userId,
        },
      );

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 },
        );
      }

      return NextResponse.json({
        ok: true,
        requestid: data,
      });
    }

    if (action === "restore-finance-review") {
      if (!canFinanceReview(viewer)) {
        return NextResponse.json(
          { error: "Only Finance & Admin can review restorations." },
          { status: 403 },
        );
      }

      const requestid = String(body.requestid ?? "");
      const approved = Boolean(body.approved);
      const comments =
        body.comments == null ? null : String(body.comments).trim();

      if (!requestid) {
        return NextResponse.json(
          { error: "Restoration request ID is required." },
          { status: 400 },
        );
      }

      if (!approved && !comments) {
        return NextResponse.json(
          { error: "A rejection reason is required." },
          { status: 400 },
        );
      }

      const { error } = await supabase.rpc(
        "review_archive_restoration",
        {
          p_requestid: requestid,
          p_userid: viewer.userId,
          p_approved: approved,
          p_comments: comments,
        },
      );

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 },
        );
      }

      return NextResponse.json({ ok: true });
    }

    if (action === "restore-md-review") {
      if (!canMdReview(viewer)) {
        return NextResponse.json(
          {
            error:
              "Only MD Office can perform final restoration approval.",
          },
          { status: 403 },
        );
      }

      const requestid = String(body.requestid ?? "");
      const approved = Boolean(body.approved);
      const comments =
        body.comments == null ? null : String(body.comments).trim();

      if (!requestid) {
        return NextResponse.json(
          { error: "Restoration request ID is required." },
          { status: 400 },
        );
      }

      if (!approved && !comments) {
        return NextResponse.json(
          { error: "A rejection reason is required." },
          { status: 400 },
        );
      }

      const { error } = await supabase.rpc(
        "finalize_archive_restoration",
        {
          p_requestid: requestid,
          p_userid: viewer.userId,
          p_approved: approved,
          p_comments: comments,
        },
      );

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 },
        );
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { error: "Unknown archive action." },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Archive operation failed.",
      },
      { status: 500 },
    );
  }
}