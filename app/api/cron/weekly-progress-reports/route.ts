import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendProjectReportEmail } from "@/lib/mailer";

function lagosToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return new Date(
    `${value("year")}-${value("month")}-${value("day")}T00:00:00Z`,
  );
}

const iso = (date: Date) => date.toISOString().slice(0, 10);

function mondayOf(date: Date) {
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return iso(monday);
}

async function delivered(
  admin: ReturnType<typeof createAdminClient>,
  key: string,
) {
  const { data } = await admin
    .from("projectreportnotifications")
    .select("notificationid")
    .eq("notificationkey", key)
    .maybeSingle();
  return Boolean(data);
}

export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const today = lagosToday();
  const daysToSunday = (7 - today.getUTCDay()) % 7;
  const reportweek = mondayOf(today);
  let remindersSent = 0;

  // Operations uploads reports. Remind active Operations staff three days and
  // one day before the Sunday end of each weekly reporting period.
  if (daysToSunday === 3 || daysToSunday === 1) {
    const event =
      daysToSunday === 3
        ? "OPERATIONS_3_DAY_WEEKLY_REMINDER"
        : "OPERATIONS_1_DAY_WEEKLY_REMINDER";
    const { data: staff } = await admin
      .from("users")
      .select("userid,fullname,email,loginemail")
      .eq("department", "Operations")
      .eq("usertype", "Staff")
      .eq("status", "Active");
    for (const person of staff ?? []) {
      const email = person.loginemail || person.email;
      const key = `${event}:${reportweek}:${person.userid}`;
      if (!email || (await delivered(admin, key))) continue;
      const result = await sendProjectReportEmail({
        to: email,
        subject: `Weekly Progress Reports due in ${daysToSunday} day${daysToSunday === 1 ? "" : "s"}`,
        html: `<p>Hello ${person.fullname},</p><p>Weekly Progress Reports for the week beginning ${reportweek} are due by Sunday. Please upload each assigned project report as a PDF in FinCon Suite.</p>`,
      });
      if (result.sent) {
        await admin
          .from("projectreportnotifications")
          .insert({
            notificationkey: key,
            eventtype: event,
            reportweek,
            recipientemail: email,
          });
        remindersSent++;
      }
    }
  }
  return NextResponse.json({ date: iso(today), reportweek, remindersSent });
}
