-- Normalize user approval status to fit the existing VARCHAR(10) column.
-- Run once in Supabase SQL Editor if any older rows were stored as
-- "Pending Approval" after the column had already been expanded.
BEGIN;
ALTER TABLE public.users ALTER COLUMN status TYPE VARCHAR(20);
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS chk_users_status;
ALTER TABLE public.users
  ADD CONSTRAINT chk_users_status
  CHECK (status IN ('Active', 'Inactive', 'Pending', 'Suspended'));
UPDATE public.users SET status = 'Pending' WHERE status = 'Pending Approval';
COMMIT;
