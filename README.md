# KCBL FinCon Suite — Frontend

Next.js 14 (App Router, TypeScript, Tailwind) frontend for the KCBL
Construction Finance Management System, wired to the existing Supabase
project (schema, RLS policies, and seed data already built and tested).

## What's included

- Login (Supabase Auth, email + password)
- Session handling via middleware (keeps you logged in, protects `/dashboard`)
- Dashboard shell that reads your real role from `Users` + `Roles`
- **User Management** (Super Admin only): create Staff/Client accounts and
  view the full user list.
- **Client & KYC intake**: individual/company conditional KYC data, director,
  beneficial-owner, source-of-funds and Staff-only risk-assessment inputs.
- **Projects, Suppliers and Subcontractors**: create and view operational
  master data with linked Client and Project Manager records.
- **Cash Inflow and Cash Outflow**: Maker/Super Admin capture forms; outflow
  uses a mutually exclusive Supplier/Subcontractor selector.
- **Approval queue and audit trail**: Checker/Super Admin approval/rejection
  actions, self-approval prevention, rejection reasons, and append-only logs.
- **Client Portal**: read-only account, project, inflow, document and private weekly Progress Report view.
- **Weekly Progress Reports**: assigned Operations staff upload one PDF per project/week (100 MB maximum); supervisors review, MD Office authorizes, and clients receive immediate availability notices.

## Setup

1. **Install dependencies** (requires Node.js 18.17+):
   ```bash
   npm install
   ```

2. **Create your environment file:**
   ```bash
   cp .env.local.example .env.local
   ```
   The Supabase URL and anon key are already filled in (safe to expose —
   protected by RLS). You still need to add one thing yourself:

   - Go to Supabase Dashboard → Settings → API → copy the **service_role**
     key → paste it into `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
   - **Never commit this file or paste that key anywhere public** — it
     bypasses Row Level Security entirely. `.env.local` is already
     gitignored.

3. **Run it locally:**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000 — you should be redirected to `/login`.

4. **Log in** with your existing Super Admin account
   (`olukoremiwasamuel@gmail.com` / the password you set when you
   bootstrapped it). You should land on `/dashboard` and see a
   "User Management" card, since that account is Super Admin.

5. **Try creating a user** from the User Management screen — this calls
   `/api/users/create`, which verifies you're a Super Admin using your
   real session, then uses the service role key server-side to create
   the new Auth account and the matching `Users` row.

## Deploying to Vercel

1. Push this project to a GitHub repo.
2. Import it in Vercel.
3. Add the Supabase variables plus `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and
   `CRON_SECRET` from `.env.local` in
   Vercel's Project Settings → Environment Variables (never commit them —
   set them directly in Vercel's dashboard).
4. In Resend, verify the sender domain used by `RESEND_FROM_EMAIL`.
5. Deploy. `vercel.json` schedules the secure report job daily at 07:00 UTC
   (08:00 Africa/Lagos). It sends MD Office reminders three days and one day
   before the weekly Sunday deadline, and immediate client availability notices after upload.

**Reminder:** Vercel's free Hobby plan is for personal, non-commercial
use only. This is a commercial system for a business (KCBL), so plan to
upgrade to Vercel Pro (~$20/month) before real users depend on this in
production — Hobby is fine for now, while still building/testing.

## Architecture notes

- `lib/supabase/client.ts` — browser client, used in Client Components.
  Every request from here is fully subject to RLS.
- `lib/supabase/server.ts` — server client, used in Server Components and
  Route Handlers. Reads the session from cookies so `auth.uid()` resolves
  correctly inside your RLS policies.
- `lib/supabase/admin.ts` — service-role client. **Bypasses RLS
  entirely.** Only ever imported inside `app/api/**/route.ts` files,
  and only after independently checking the caller's role using their
  own session first (see `app/api/users/create/route.ts` for the
  pattern to follow for future admin-only actions).
- `middleware.ts` — refreshes the session cookie on every request and
  redirects unauthenticated visitors away from `/dashboard`.

## Progress-report database migrations

Run [supabase/20260917_project_reports.sql](./supabase/20260917_project_reports.sql)
once in Supabase SQL Editor before using Project Reports. It creates the report
metadata and notification log, then creates a private `project-reports` bucket
restricted to PDFs up to 100 MB. The application never exposes a public bucket
URL; it checks the session and project ownership before issuing a 60-second
download URL.
