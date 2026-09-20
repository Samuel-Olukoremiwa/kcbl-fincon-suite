import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/viewer";

export async function GET() {
  await requireStaff();

  const supabase = createClient();

  const { data, error } = await supabase
    .from("transactioncategories")
    .select(
      "categoryid,categoryname,isinhouse,active",
    )
    .eq("active", true)
    .order("categoryname");

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    categories: data ?? [],
  });
}

export async function POST(request: Request) {
  const viewer = await requireStaff();

  if (viewer.roleName !== "Super User") {
    return NextResponse.json(
      {
        error:
          "Only the Super User can create transaction categories.",
      },
      { status: 403 },
    );
  }

  const body = await request.json();

  const categoryname = String(
    body.categoryname ?? "",
  ).trim();

  const isinhouse = Boolean(body.isinhouse);

  if (!categoryname) {
    return NextResponse.json(
      {
        error: "Category name is required.",
      },
      { status: 400 },
    );
  }

  const supabase = createClient();

  const { data, error } = await supabase
    .from("transactioncategories")
    .insert({
      categoryname,
      isinhouse,
      createdbyuserid: viewer.userId,
    })
    .select(
      "categoryid,categoryname,isinhouse,active",
    )
    .single();

  if (error) {
    const message =
      error.code === "23505"
        ? "A category with this name already exists."
        : error.message;

    return NextResponse.json(
      {
        error: message,
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      category: data,
    },
    { status: 201 },
  );
}

export async function PATCH(request: Request) {
  const viewer = await requireStaff();

  if (viewer.roleName !== "Super User") {
    return NextResponse.json(
      {
        error:
          "Only the Super User can deactivate transaction categories.",
      },
      { status: 403 },
    );
  }

  const body = await request.json();
  const categoryid = body.categoryid;

  if (!categoryid) {
    return NextResponse.json(
      {
        error: "categoryid is required.",
      },
      { status: 400 },
    );
  }

  const supabase = createClient();

  const { error } = await supabase
    .from("transactioncategories")
    .update({
      active: false,
    })
    .eq("categoryid", categoryid);

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
  });
}