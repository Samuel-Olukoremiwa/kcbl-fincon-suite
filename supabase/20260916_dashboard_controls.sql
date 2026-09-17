-- KCBL dashboard and financial-control upgrade. Run in Supabase SQL Editor.
BEGIN;

-- The original schema calls this chk_projects_status. Remove it before
-- converting existing "In Progress" rows to the revised vocabulary.
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS chk_projects_status;
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check;
UPDATE public.projects SET status = 'Pending' WHERE status = 'Planned';
UPDATE public.projects SET status = 'Ongoing' WHERE status IN ('In Progress', 'InProgress');
ALTER TABLE public.projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('Ongoing', 'Completed', 'On Hold', 'Pending'));

COMMIT;
