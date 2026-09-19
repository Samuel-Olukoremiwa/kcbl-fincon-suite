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
    const { error } = await mailer.resend.emails.send({
      from: mailer.fromEmail,
      to,
      subject,
      html,
    });

    if (error) {
      console.error("Resend email error:", error);

      return {
        sent: false,
        error: error.message,
      };
    }

    return {
      sent: true,
    };
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