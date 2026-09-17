import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendProjectReportEmail } from "@/lib/mailer";

function lagosDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return new Date(`${value("year")}-${value("month")}-${value("day")}T00:00:00Z`);
}
const iso = (date: Date) => date.toISOString().slice(0, 10);
async function delivered(admin: ReturnType<typeof createAdminClient>, key: string) {
  const { data } = await admin.from("projectreportnotifications").select("notificationid").eq("notificationkey", key).maybeSingle();
  return Boolean(data);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const today = lagosDate();
  const year = today.getUTCFullYear(), month = today.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const reportMonth = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const daysToEnd = lastDay - today.getUTCDate();
  let remindersSent = 0, clientsNotified = 0;

  if (daysToEnd === 3 || daysToEnd === 1) {
    const event = daysToEnd === 3 ? "MD_OFFICE_3_DAY_REMINDER" : "MD_OFFICE_1_DAY_REMINDER";
    const { data: staff } = await admin.from("users").select("userid,fullname,email,loginemail").eq("department", "MD Office").eq("usertype", "Staff").eq("status", "Active");
    for (const person of staff ?? []) {
      const email = person.loginemail || person.email;
      const key = `${event}:${reportMonth}:${person.userid}`;
      if (!email || await delivered(admin, key)) continue;
      const result = await sendProjectReportEmail({
        to: email,
        subject: `Project reports due in ${daysToEnd} day${daysToEnd === 1 ? "" : "s"}`,
        html: `<p>Hello ${person.fullname},</p><p>Monthly project reports for ${reportMonth.slice(0, 7)} are due by month end. Please upload each report as a PDF in FinCon Suite.</p>`,
      });
      if (result.sent) { await admin.from("projectreportnotifications").insert({ notificationkey: key, eventtype: event, reportmonth: reportMonth, recipientemail: email }); remindersSent++; }
    }
  }

  // Client notices are sent by the upload route immediately. This cron only
  // handles MD Office's month-end upload reminders.
  return NextResponse.json({ date: iso(today), remindersSent, clientsNotified });
}
