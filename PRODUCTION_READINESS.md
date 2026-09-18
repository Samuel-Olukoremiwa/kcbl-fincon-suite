# KCBL FinCon Suite production readiness

## Required external configuration

1. **Resend**: verify KCBL's sender domain, then set `RESEND_API_KEY` and
   `RESEND_FROM_EMAIL` in Vercel. Never expose either value in browser code.
2. **Weekly reminders**: Vercel Cron is configured in `vercel.json` to call
   `/api/cron/weekly-progress-reports` daily at 07:00 UTC. Set a long random
   `CRON_SECRET` in Vercel. Vercel adds the matching authorization header.
   Confirm the project has a Vercel plan that permits daily cron jobs.
3. **HTTPS**: deploy only behind Vercel's managed HTTPS domain and set
   `NEXT_PUBLIC_APP_URL` to the production `https://` URL.
4. **Supabase Auth**: add the production URL and
   `https://your-domain/login/reset-password` to Authentication URL
   Configuration. Enable the available CAPTCHA / bot-protection option and
   configure rate limits for password sign-in and recovery emails.

## Database security review

Run the supplied migrations, then use Supabase's RLS advisor to verify that:

- RLS is enabled on every application table and storage bucket.
- Users can read only records permitted by their department, assignment, or
  linked client account.
- `service_role` is never used in browser code. It is server-only.
- Project Reports storage stays private and is served only with signed URLs.
- Audit, archive, and financial write policies cannot be changed by a
  read-only role.

## Security controls implemented in the app

- Server-side role and module checks for write routes.
- Input validation for uploads, report periods, dates, and transaction values.
- 100 MB PDF limit and private report storage.
- Secure headers: frame denial, MIME sniffing denial, restricted permissions,
  strict referrer handling, and same-origin opener policy.
- Cookie notice and legal-policy links.

## Dependency finding

`npm audit --omit=dev --audit-level=high` currently reports one **critical**
Next.js and one **high** PostCSS issue through the Next 14 dependency chain.
The available automatic remedy upgrades Next.js to 16, which is a breaking
framework upgrade. Schedule that upgrade in a staging environment, run the
full regression suite, then deploy it separately. Do not run `npm audit fix
--force` directly on production.

## QA before launch

- Test keyboard-only navigation, visible focus, and form errors on desktop and
  mobile widths.
- Test every role listed in the access matrix, including direct URLs and API
  write attempts.
- Confirm weekly report email delivery and Thursday/Saturday reminders with
  non-production recipients first.
- Test password-reset, session timeout, upload failure, and forbidden-access
  paths.
