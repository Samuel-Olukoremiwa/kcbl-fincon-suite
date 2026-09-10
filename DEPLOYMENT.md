# KCBL Control Upgrade Deployment

## Apply database changes

1. Back up the Supabase database.
2. In Supabase SQL Editor, run `supabase/20260905_control_upgrade.sql` once as `postgres`.
3. Confirm that existing roles now display as `Super User`, `Initiator`, and `Authorizer`.
4. In Authentication → URL Configuration, add `http://localhost:3000/login` as a redirect URL for local testing, and your production login URL when deployed.

## Install frontend

Copy this project into the active frontend folder, preserving its existing `.env.local` file. Then run:

```bash
npm install
npm run dev
```

The existing service-role key remains server-only. Do not add it to browser code or commit it.

## SMTP behaviour

Supabase SMTP is already configured. The application creates a secure temporary password and triggers a Supabase password-set email. The temporary password is returned only to the Super User inside the protected application response; it is not included in email.

## Control approval setup

Assign the `Internal Control` role to each authorised Control Team reviewer. These users are read-only in the matrix modules, but may approve or reject a Super User's session-timeout request in Security Settings.

## In-House Transactions

The migration creates `CLI00000` (KCBL Internal) and `PRJ00000` (In-House Transactions). Existing inflows without a project are moved to this protected project so the mandatory-project rule can be applied safely.

## Verification checks

- Super User: can create users and request timeout changes, but cannot self-approve transactions.
- Internal Control: can review a timeout change, but cannot edit business data.
- Initiator: can initiate assigned records and transactions.
- Authorizer: reviews transactions but cannot amend initiated values.
- Client: can view only their own portal data.
