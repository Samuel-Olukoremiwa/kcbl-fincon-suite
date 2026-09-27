-- KCBL FinCon Suite
-- Temporary staff type + automatic access expiry
--
-- Behaviour:
-- - Permanent staff do not require an expiry date.
-- - Intern, NYSC and Temporary Staff require an Access Expiry Date.
-- - Access remains valid THROUGH the selected expiry date.
-- - From the following calendar day (Africa/Lagos), FinCon Suite access is blocked.
-- - Existing staff are preserved as Permanent so nobody is unexpectedly locked out.
--
-- Run once in Supabase SQL Editor as postgres.

BEGIN;

-- ============================================================
-- 1. PRE-ACCOUNT STAFF ONBOARDING
-- ============================================================
ALTER TABLE public.staffonboarding
  ADD COLUMN IF NOT EXISTS stafftype VARCHAR(30) NOT NULL DEFAULT 'Permanent';

ALTER TABLE public.staffonboarding
  ADD COLUMN IF NOT EXISTS accessexpirydate DATE;

UPDATE public.staffonboarding
SET stafftype = 'Permanent'
WHERE stafftype IS NULL OR BTRIM(stafftype) = '';

ALTER TABLE public.staffonboarding
  DROP CONSTRAINT IF EXISTS staffonboarding_stafftype_access_check;

ALTER TABLE public.staffonboarding
  ADD CONSTRAINT staffonboarding_stafftype_access_check
  CHECK (
    stafftype IN ('Permanent', 'Intern', 'NYSC', 'Temporary Staff')
    AND (
      (stafftype = 'Permanent' AND accessexpirydate IS NULL)
      OR
      (stafftype IN ('Intern', 'NYSC', 'Temporary Staff') AND accessexpirydate IS NOT NULL)
    )
  );

CREATE INDEX IF NOT EXISTS ix_staffonboarding_access_expiry
  ON public.staffonboarding(accessexpirydate)
  WHERE accessexpirydate IS NOT NULL;

-- ============================================================
-- 2. OFFICIAL STAFF PERSONNEL RECORD
-- ============================================================
ALTER TABLE public.staffprofiles
  ADD COLUMN IF NOT EXISTS stafftype VARCHAR(30) NOT NULL DEFAULT 'Permanent';

ALTER TABLE public.staffprofiles
  ADD COLUMN IF NOT EXISTS accessexpirydate DATE;

UPDATE public.staffprofiles
SET stafftype = 'Permanent'
WHERE stafftype IS NULL OR BTRIM(stafftype) = '';

ALTER TABLE public.staffprofiles
  DROP CONSTRAINT IF EXISTS staffprofiles_stafftype_access_check;

ALTER TABLE public.staffprofiles
  ADD CONSTRAINT staffprofiles_stafftype_access_check
  CHECK (
    stafftype IN ('Permanent', 'Intern', 'NYSC', 'Temporary Staff')
    AND (
      (stafftype = 'Permanent' AND accessexpirydate IS NULL)
      OR
      (stafftype IN ('Intern', 'NYSC', 'Temporary Staff') AND accessexpirydate IS NOT NULL)
    )
  );

CREATE INDEX IF NOT EXISTS ix_staffprofiles_access_expiry
  ON public.staffprofiles(accessexpirydate)
  WHERE accessexpirydate IS NOT NULL;

-- ============================================================
-- 3. SYSTEM LOGIN ACCOUNT
-- ============================================================
-- These fields are duplicated intentionally on users because login access must
-- be checked without relying on a separate personnel-table query.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS stafftype VARCHAR(30);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS accessexpirydate DATE;

-- Existing staff become Permanent. Client accounts remain NULL for these fields.
UPDATE public.users
SET stafftype = 'Permanent',
    accessexpirydate = NULL
WHERE usertype = 'Staff'
  AND (stafftype IS NULL OR BTRIM(stafftype) = '');

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_stafftype_access_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_stafftype_access_check
  CHECK (
    usertype <> 'Staff'
    OR (
      stafftype IN ('Permanent', 'Intern', 'NYSC', 'Temporary Staff')
      AND (
        (stafftype = 'Permanent' AND accessexpirydate IS NULL)
        OR
        (stafftype IN ('Intern', 'NYSC', 'Temporary Staff') AND accessexpirydate IS NOT NULL)
      )
    )
  );

CREATE INDEX IF NOT EXISTS ix_users_staff_access_expiry
  ON public.users(accessexpirydate)
  WHERE usertype = 'Staff' AND accessexpirydate IS NOT NULL;

-- ============================================================
-- 4. KEEP EXISTING ACCOUNT-CREATED ONBOARDING ROWS IN SYNC
-- ============================================================
UPDATE public.staffonboarding so
SET
  stafftype = COALESCE(u.stafftype, 'Permanent'),
  accessexpirydate = u.accessexpirydate
FROM public.users u
WHERE so.createduserid = u.userid
  AND u.usertype = 'Staff';

UPDATE public.staffprofiles sp
SET
  stafftype = COALESCE(u.stafftype, 'Permanent'),
  accessexpirydate = u.accessexpirydate
FROM public.users u
WHERE sp.userid = u.userid
  AND u.usertype = 'Staff';

COMMIT;
