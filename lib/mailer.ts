
import { Resend } from "resend";

function getMailer() {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    return null;
  }

  return {
    resend: new Resend(apiKey),
    fromEmail,
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/*
 * =========================================================
 * PROJECT REPORT EMAIL
 * =========================================================
 *
 * Adds a secure login link to project-report
 * notifications while preserving the original
 * email content.
 *
 * The login link does not provide direct access
 * to reports without authentication.
 */

export async function sendProjectReportEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const mailer = getMailer();

  if (!mailer) {
    return {
      sent: false,
      error:
        "RESEND_API_KEY or RESEND_FROM_EMAIL is not configured.",
    };
  }

  const loginUrl = "https://kcblfincon.com/login";

  const safeLoginUrl = escapeHtml(loginUrl);

  const loginSection = `
    <div
      style="
        font-family: Arial, sans-serif;
        line-height: 1.6;
        color: #1e293b;
        padding: 16px 0 24px;
      "
    >
      <p>
        To access your project report, please log in
        to KCBL FinCon Suite using your registered
        account.
      </p>

      <p style="margin: 24px 0;">
        <a
          href="${safeLoginUrl}"
          style="
            display: inline-block;
            background-color: #123c70;
            color: #ffffff;
            padding: 14px 24px;
            text-decoration: none;
            font-size: 14px;
            font-weight: bold;
            border-radius: 6px;
          "
        >
          Log in to View Project Report
        </a>
      </p>

      <p
        style="
          font-size: 12px;
          color: #64748b;
        "
      >
        If the button does not work, copy and paste
        this link into your browser:
      </p>

      <p>
        <a
          href="${safeLoginUrl}"
          style="color: #123c70;"
        >
          ${safeLoginUrl}
        </a>
      </p>

      <p
        style="
          font-size: 12px;
          color: #64748b;
        "
      >
        For security, you must sign in before
        accessing any project reports.
      </p>
    </div>
  `;

  try {
    const { error } = await mailer.resend.emails.send({
      from: mailer.fromEmail,
      to,
      subject,
      html: html + loginSection,
    });

    if (error) {
      console.error("Resend email error:", error);

      return {
        sent: false,
        error: error.message,
      };
    }

    return { sent: true };
  } catch (error) {
    console.error("Unexpected Resend error:", error);

    return {
      sent: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown email error.",
    };
  }
}

/*
 * =========================================================
 * CLIENT WELCOME EMAIL
 * =========================================================
 */

export async function sendClientWelcomeEmail({
  to,
  clientName,
  email,
  temporaryPassword,
  portalUrl,
  isNewPortalAccount,
}: {
  to: string;
  clientName: string;
  email: string;
  temporaryPassword: string | null;
  portalUrl: string;
  isNewPortalAccount: boolean;
}) {
  const mailer = getMailer();

  if (!mailer) {
    return {
      sent: false,
      error:
        "RESEND_API_KEY or RESEND_FROM_EMAIL is not configured.",
    };
  }

  const safeName = escapeHtml(clientName);
  const safeEmail = escapeHtml(email);
  const safePortalUrl = escapeHtml(portalUrl);

  const safeTemporaryPassword = temporaryPassword
    ? escapeHtml(temporaryPassword)
    : null;

  const accountInstructions =
    isNewPortalAccount && safeTemporaryPassword
      ? `
        <p>
          Your Client Portal account has been created.
          Use the temporary password below for your
          first sign-in.
        </p>

        <div
          style="
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
          "
        >
          <p style="margin-top: 0;">
            <strong>Login email:</strong>
            ${safeEmail}
          </p>

          <p style="margin-bottom: 0;">
            <strong>Temporary password:</strong>
            ${safeTemporaryPassword}
          </p>
        </div>

        <p>
          You will be required to create your own
          password immediately after your first
          successful sign-in before you can access
          the Client Portal.
        </p>
      `
      : `
        <p>
          This client record has been linked to your
          existing Client Portal account.
        </p>

        <div
          style="
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
          "
        >
          <p style="margin: 0;">
            <strong>Login email:</strong>
            ${safeEmail}
          </p>
        </div>

        <p>
          Continue using your existing password.
          If you have forgotten it, use the
          Forgot Password option on the sign-in page.
        </p>
      `;

  try {
    const { error } = await mailer.resend.emails.send({
      from: mailer.fromEmail,
      to,
      subject:
        "Your KCBL FinCon Suite Client Portal account",
      html: `
        <div
          style="
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #1e293b;
            max-width: 620px;
            margin: 0 auto;
          "
        >
          <h2>Welcome to KCBL FinCon Suite</h2>

          <p>Hello ${safeName},</p>

          ${accountInstructions}

          <p>
            You can access the Client Portal here:
          </p>

          <p>
            <a
              href="${safePortalUrl}"
              style="
                display: inline-block;
                background: #0f172a;
                color: #ffffff;
                text-decoration: none;
                padding: 12px 18px;
                border-radius: 6px;
                font-weight: 600;
              "
            >
              Open Client Portal
            </a>
          </p>

          <p>
            Please keep your login information
            private and do not share your password
            with anyone.
          </p>

          <p>
            Regards,<br />
            KCBL FinCon Suite
          </p>
        </div>
      `,
    });

    if (error) {
      console.error(
        "Client welcome email error:",
        error,
      );

      return {
        sent: false,
        error: error.message,
      };
    }

    return { sent: true };
  } catch (error) {
    console.error(
      "Unexpected client welcome email error:",
      error,
    );

    return {
      sent: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown email error.",
    };
  }
}

/*
 * =========================================================
 * STAFF WELCOME EMAIL
 * =========================================================
 */

export async function sendStaffWelcomeEmail({
  to,
  staffName,
  email,
  temporaryPassword,
  portalUrl,
}: {
  to: string;
  staffName: string;
  email: string;
  temporaryPassword: string;
  portalUrl: string;
}) {
  const mailer = getMailer();

  if (!mailer) {
    return {
      sent: false,
      error:
        "RESEND_API_KEY or RESEND_FROM_EMAIL is not configured.",
    };
  }

  const safeName = escapeHtml(staffName);
  const safeEmail = escapeHtml(email);
  const safeTemporaryPassword =
    escapeHtml(temporaryPassword);
  const safePortalUrl = escapeHtml(portalUrl);

  try {
    const { error } = await mailer.resend.emails.send({
      from: mailer.fromEmail,
      to,
      subject:
        "Your KCBL FinCon Suite staff account",
      html: `
        <div
          style="
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #1e293b;
            max-width: 620px;
            margin: 0 auto;
          "
        >
          <h2>Welcome to KCBL FinCon Suite</h2>

          <p>Hello ${safeName},</p>

          <p>
            Your FinCon Suite staff account has
            been created and is awaiting final
            account approval.
          </p>

          <div
            style="
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 20px;
              margin: 20px 0;
            "
          >
            <p style="margin-top: 0;">
              <strong>Login email:</strong>
              ${safeEmail}
            </p>

            <p style="margin-bottom: 0;">
              <strong>Temporary password:</strong>
              ${safeTemporaryPassword}
            </p>
          </div>

          <p>
            Once your account has been approved,
            sign in using the temporary password
            above. You will be required to create
            your own password immediately after
            your first successful sign-in before
            you can access the system.
          </p>

          <p>
            <a
              href="${safePortalUrl}"
              style="
                display: inline-block;
                background: #0f172a;
                color: #ffffff;
                text-decoration: none;
                padding: 12px 18px;
                border-radius: 6px;
                font-weight: 600;
              "
            >
              Open FinCon Suite
            </a>
          </p>

          <p>
            Please keep your login information
            private and do not share your password
            with anyone.
          </p>

          <p>
            Regards,<br />
            KCBL FinCon Suite
          </p>
        </div>
      `,
    });

    if (error) {
      console.error(
        "Staff welcome email error:",
        error,
      );

      return {
        sent: false,
        error: error.message,
      };
    }

    return { sent: true };
  } catch (error) {
    console.error(
      "Unexpected staff welcome email error:",
      error,
    );

    return {
      sent: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown email error.",
    };
  }
}
