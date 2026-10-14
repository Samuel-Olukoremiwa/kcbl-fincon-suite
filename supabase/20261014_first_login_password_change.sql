-- KCBL FinCon Suite
-- First-login temporary-password enforcement for new Staff and Clients.
-- Existing users are preserved: they default to mustchangepassword = FALSE.

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS mustchangepassword BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.users
SET mustchangepassword = FALSE
WHERE mustchangepassword IS NULL;

CREATE INDEX IF NOT EXISTS ix_users_must_change_password
  ON public.users(mustchangepassword)
  WHERE mustchangepassword = TRUE;

COMMIT;
