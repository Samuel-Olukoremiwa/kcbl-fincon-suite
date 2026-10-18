BEGIN;
-- Retain historical weekly Operations records. Newly submitted Operations
-- reports use reportdate; Project Manager weekly reports leave it NULL.
ALTER TABLE public.projectreports
  ADD COLUMN IF NOT EXISTS reportdate date;
CREATE INDEX IF NOT EXISTS ix_projectreports_project_reportdate
  ON public.projectreports(projectid, reportdate DESC)
  WHERE reportdate IS NOT NULL;
-- The existing reportweek column continues to hold the Monday of the
-- selected daily report's week, so storage and legacy filters still work.
COMMIT;
