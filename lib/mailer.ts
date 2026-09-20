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

  try {
    const { error } =
      await mailer.resend.emails.send({
        from: mailer.fromEmail,
        to,
        subject,
        html,
      });

    if (error) {
      console.error(
        "Resend email error:",
        error,
      );

      return {
        sent: false,
        error: error.message,
      };
    }

    return {
      sent: true,
    };
  } catch (error) {
    console.error(
      "Unexpected Resend error:",
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

export async function sendClientWelcomeEmail({
  to,
  clientName,
  email,
  temporaryPassword,
  resetLink,
  portalUrl,
}: {
  to: string;
  clientName: string;
  email: string;
  temporaryPassword: string;
  resetLink: string;
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

  const safeName =
    escapeHtml(clientName);
  const safeEmail =
    escapeHtml(email);
  const safePassword =
    escapeHtml(temporaryPassword);
  const safeResetLink =
    escapeHtml(resetLink);
  const safePortalUrl =
    escapeHtml(portalUrl);

  try {
    const { error } =
      await mailer.resend.emails.send({
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
            <h2>
              Welcome to KCBL FinCon Suite
            </h2>

            <p>
              Hello ${safeName},
            </p>

            <p>
              Your Client Portal account has
              been created successfully.
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

              <p>
                <strong>Temporary password:</strong>
                ${safePassword}
              </p>
            </div>

            <p>
              For security, please use the password
              reset link below to set your own password
              before continuing to use the portal.
            </p>

            <p>
              <a
                href="${safeResetLink}"
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
                Set / Reset Your Password
              </a>
            </p>

            <p>
              You can access the Client Portal here:
            </p>

            <p>
              <a href="${safePortalUrl}">
                ${safePortalUrl}
              </a>
            </p>

            <p>
              Please keep your login information private
              and do not share your password with anyone.
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

    return {
      sent: true,
    };
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}