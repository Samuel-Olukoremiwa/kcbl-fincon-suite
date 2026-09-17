import { Resend } from "resend";

function mailer() {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !from) return null;
  return { resend: new Resend(key), from };
}

export async function sendProjectReportEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const config = mailer();
  if (!config) return { sent: false, error: "RESEND_API_KEY or RESEND_FROM_EMAIL is not configured." };
  const { error } = await config.resend.emails.send({ from: config.from, to, subject, html });
  return error ? { sent: false, error: error.message } : { sent: true };
}
