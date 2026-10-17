import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendProjectReportEmail } from "@/lib/mailer";

function lagosToday() {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "Africa/Lagos",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      },
    ).formatToParts(
      new Date(),
    );

  const value = (
    type: string,
  ) =>
    parts.find(
      (part) =>
        part.type === type,
    )?.value ?? "";

  return new Date(
    `${value("year")}-${value("month")}-${value("day")}T00:00:00Z`,
  );
}

const iso = (
  date: Date,
) =>
  date
    .toISOString()
    .slice(0, 10);

function mondayOf(
  date: Date,
) {
  const monday =
    new Date(date);

  monday.setUTCDate(
    date.getUTCDate() -
      ((
        date.getUTCDay() +
        6
      ) %
        7),
  );

  return iso(monday);
}

async function delivered(
  admin: ReturnType<
    typeof createAdminClient
  >,
  key: string,
) {
  const {
    data,
  } = await admin
    .from(
      "projectreportnotifications",
    )
    .select(
      "notificationid",
    )
    .eq(
      "notificationkey",
      key,
    )
    .maybeSingle();

  return Boolean(data);
}

export async function GET(
  request: Request,
) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get(
      "authorization",
    ) !==
      `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json(
      {
        error:
          "Unauthorized",
      },
      { status: 401 },
    );
  }

  const admin =
    createAdminClient();

  const today =
    lagosToday();

  const daysToSunday =
    (7 -
      today.getUTCDay()) %
    7;

  const reportweek =
    mondayOf(today);

  let remindersSent = 0;

  /*
   * Only approved, active Project Managers submit the
   * client-facing weekly Progress Report.
   *
   * Other Operations staff may submit internal Operations
   * Reports, but they do not receive this weekly PM reminder.
   */
  if (
    daysToSunday === 3 ||
    daysToSunday === 1
  ) {
    const event =
      daysToSunday === 3
        ? "OPERATIONS_3_DAY_WEEKLY_REMINDER"
        : "OPERATIONS_1_DAY_WEEKLY_REMINDER";

    const {
      data: assignments,
      error:
        assignmentError,
    } = await admin
      .from(
        "projectassignments",
      )
      .select(
        "projectid,userid",
      )
      .eq(
        "assignmentrole",
        "Project Manager",
      )
      .eq(
        "approvalstatus",
        "Approved",
      )
      .eq(
        "active",
        true,
      );

    if (assignmentError) {
      return NextResponse.json(
        {
          error:
            assignmentError.message,
        },
        { status: 500 },
      );
    }

    const userIds =
      Array.from(
        new Set(
          (
            assignments ?? []
          ).map(
            (assignment) =>
              assignment.userid,
          ),
        ),
      );

    if (userIds.length) {
      const {
        data: staff,
      } = await admin
        .from("users")
        .select(
          "userid,fullname,email,loginemail",
        )
        .in(
          "userid",
          userIds,
        )
        .eq(
          "usertype",
          "Staff",
        )
        .eq(
          "status",
          "Active",
        );

      for (
        const person of
          staff ?? []
      ) {
        const email =
          person.loginemail ||
          person.email;

        const key =
          `${event}:${reportweek}:${person.userid}`;

        if (
          !email ||
          (await delivered(
            admin,
            key,
          ))
        ) {
          continue;
        }

        const projectCount =
          (
            assignments ??
            []
          ).filter(
            (assignment) =>
              assignment.userid ===
              person.userid,
          ).length;

        const result =
          await sendProjectReportEmail(
            {
              to: email,
              subject:
                `Weekly Project Manager Progress Report due in ${daysToSunday} day${
                  daysToSunday ===
                  1
                    ? ""
                    : "s"
                }`,
              html: `<p>Hello ${person.fullname},</p><p>Your weekly Project Manager Progress Report for ${projectCount} active assigned project${projectCount === 1 ? "" : "s"} is due by Sunday for the week beginning ${reportweek}. Please upload the PDF, enter the project progress percentage, and attach any supporting images/videos in FinCon Suite.</p>`,
            },
          );

        if (result.sent) {
          await admin
            .from(
              "projectreportnotifications",
            )
            .insert({
              notificationkey:
                key,
              eventtype:
                event,
              reportweek,
              recipientemail:
                email,
            });

          remindersSent++;
        }
      }
    }
  }

  return NextResponse.json({
    date:
      iso(today),
    reportweek,
    remindersSent,
  });
}
