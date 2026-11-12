
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

const LOGIN_URL = "https://kcblfincon.com/login";

export type TransactionType =
  | "Cash Inflow"
  | "Cash Outflow"
  | "Variation"
  | "Variation Payment"
  | "In-House Inflow"
  | "In-House Outflow";
type Decision = "Approved" | "Rejected";

// Word used in the email body ("Your transaction has been approved").
function itemNoun(type: TransactionType): string {
  switch (type) {
    case "Variation":
      return "variation";
    case "Variation Payment":
      return "variation payment";
    case "In-House Inflow":
    case "In-House Outflow":
      return "in-house entry";
    default:
      return "transaction";
  }
}

// Only records that lead to money being paid out get the disbursement follow-up.
function needsDisbursement(type: TransactionType): boolean {
  return (
    type === "Cash Inflow" ||
    type === "Cash Outflow" ||
    type === "In-House Outflow"
  );
}

// Short readable reference for UUID-based records, e.g. VAR-1A2B3C4D.
export function shortRef(prefix: string, id: string): string {
  return `${prefix}-${String(id).replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

type TransactionEmail = {
  transactionType: TransactionType;
  transactionId: string;
  amount: number | string;
  description?: string | null;
  projectId?: string | null;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function naira(value: number | string): string {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return String(value);
  }

  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(amount);
}

function emailShell(content: string): string {
  const loginUrl = escapeHtml(LOGIN_URL);

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.65;color:#1e293b;max-width:640px;margin:0 auto">
      <h2 style="color:#123c70">KCBL FinCon Suite</h2>

      ${content}

      <p style="margin:24px 0">
        <a
          href="${loginUrl}"
          style="display:inline-block;background:#123c70;color:#fff;padding:12px 20px;text-decoration:none;border-radius:6px;font-weight:bold"
        >
          Log in to FinCon Suite
        </a>
      </p>

      <p style="font-size:12px;color:#64748b">
        If the button does not work, visit
        <a href="${loginUrl}">${loginUrl}</a>.
      </p>

      <p>Regards,<br />KCBL FinCon Suite</p>
    </div>
  `;
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    console.error(
      "Transaction notification not sent: Resend configuration is missing.",
    );
    return;
  }

  try {
    const resend = new Resend(apiKey);

    const { error } = await resend.emails.send({
      from,
      to,
      subject,
      html: emailShell(html),
    });

    if (error) {
      console.error("Transaction notification failed:", error);
    }
  } catch (error) {
    console.error(
      "Unexpected transaction email failure:",
      error,
    );
  }
}

async function getStaffEmail(
  userId: string,
): Promise<{ name: string; email: string } | null> {
  try {
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("users")
      .select("userid,fullname,email,loginemail,status")
      .eq("userid", userId)
      .maybeSingle();

    if (error) {
      console.error(
        "Could not find transaction raiser:",
        error,
      );
      return null;
    }

    if (!data) {
      return null;
    }

    const email = String(
      data.loginemail || data.email || "",
    ).trim();

    if (!email || data.status !== "Active") {
      return null;
    }

    return {
      name: String(data.fullname || "Staff member"),
      email,
    };
  } catch (error) {
    console.error(
      "Could not load transaction raiser:",
      error,
    );
    return null;
  }
}

export async function notifyTransactionSubmitted(
  transaction: TransactionEmail & {
    makerUserId: string;
  },
): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: staff, error } = await admin
      .from("users")
      .select(
        "userid,fullname,email,loginemail,department,status,roles(rolename)",
      );

    if (error) {
      console.error(
        "Could not load transaction approvers:",
        error,
      );
      return;
    }

    const recipients = (staff ?? []).filter(
      (person: any) => {
        if (person.status !== "Active") {
          return false;
        }

        if (person.userid === transaction.makerUserId) {
          return false;
        }

        const role = Array.isArray(person.roles)
          ? person.roles[0]?.rolename
          : person.roles?.rolename;

        const email = String(
          person.loginemail || person.email || "",
        ).trim();

        if (!email) {
          return false;
        }

        return (
          role === "Super User" ||
          (
            person.department === "Finance & Admin" &&
            role === "Authorizer"
          ) ||
          (
            person.department === "MD" &&
            ["Authorizer", "MD"].includes(role)
          )
        );
      },
    );

    const uniqueEmails = [
      ...new Set(
        recipients.map((person: any) =>
          String(
            person.loginemail || person.email,
          ).trim(),
        ),
      ),
    ];

    if (uniqueEmails.length === 0) {
      console.warn(
        `No eligible email recipients found for ${transaction.transactionType} ${transaction.transactionId}.`,
      );
      return;
    }

    const noun = itemNoun(transaction.transactionType);

    // Intentionally excludes all transaction details.
    const html = `
      <p>
        A${noun.startsWith("i") ? "n" : ""} ${noun} has been submitted and is
        awaiting authorization.
      </p>

      <p>
        Please sign in to review the ${noun}
        in accordance with your authorization
        permissions.
      </p>
    `;

    await Promise.all(
      uniqueEmails.map((email) =>
        sendEmail(
          email,
          `Approval required: ${transaction.transactionType} ${transaction.transactionId}`,
          html,
        ),
      ),
    );
  } catch (error) {
    console.error(
      "Transaction submission notification failed:",
      error,
    );
  }
}

export async function notifyTransactionDecision(
  transaction: TransactionEmail & {
    makerUserId: string;
    status: Decision;
    reason?: string | null;
  },
): Promise<void> {
  try {
    const recipient = await getStaffEmail(
      transaction.makerUserId,
    );

    if (!recipient) {
      console.warn(
        `No active email address found for transaction maker ${transaction.makerUserId}.`,
      );
      return;
    }

    const approved = transaction.status === "Approved";
    const noun = itemNoun(transaction.transactionType);
    const disbursement = needsDisbursement(transaction.transactionType);
    const label =
      noun === "transaction"
        ? "Transaction"
        : transaction.transactionType;

    const subject = approved
      ? `${label} approved: ${transaction.transactionId}`
      : `${label} rejected: ${transaction.transactionId}`;

    const decisionText = approved
      ? disbursement
        ? `
        <p>Your ${noun} has been <strong>approved</strong>.</p>

        <p>
          It is now ready for the separate
          disbursement process, where applicable.
        </p>

        <p>
          <strong>
            Approval does not mean that payment
            has been made or disbursed.
          </strong>
        </p>
      `
        : `
        <p>Your ${noun} has been <strong>approved</strong>.</p>
      `
      : `
        <p>
          Your ${noun} has been
          <strong>rejected</strong> and requires
          correction before it can be resubmitted.
        </p>

        <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:14px;margin:16px 0">
          <strong>Rejection reason and required corrections</strong>

          <p style="white-space:pre-wrap">
            ${escapeHtml(
              transaction.reason ||
              "Please contact the approver for clarification.",
            )}
          </p>
        </div>
      `;

    const html = `
      <p>Hello ${escapeHtml(recipient.name)},</p>

      ${decisionText}

      ${
        approved
          ? disbursement
            ? `
            <p><strong>Kindly follow up on Disbursement</strong></p>
          `
            : ""
          : `
            <table style="border-collapse:collapse;width:100%">
              <tr>
                <td style="padding:8px;border-bottom:1px solid #e2e8f0">
                  <strong>Type</strong>
                </td>
                <td style="padding:8px;border-bottom:1px solid #e2e8f0">
                  ${escapeHtml(transaction.transactionType)}
                </td>
              </tr>

              <tr>
                <td style="padding:8px;border-bottom:1px solid #e2e8f0">
                  <strong>${noun === "transaction" ? "Transaction ID" : "Reference"}</strong>
                </td>
                <td style="padding:8px;border-bottom:1px solid #e2e8f0">
                  ${escapeHtml(transaction.transactionId)}
                </td>
              </tr>

              <tr>
                <td style="padding:8px">
                  <strong>Amount</strong>
                </td>
                <td style="padding:8px">
                  ${escapeHtml(naira(transaction.amount))}
                </td>
              </tr>
            </table>
          `
      }
    `;

    await sendEmail(recipient.email, subject, html);
  } catch (error) {
    console.error(
      "Transaction decision notification failed:",
      error,
    );
  }
}
