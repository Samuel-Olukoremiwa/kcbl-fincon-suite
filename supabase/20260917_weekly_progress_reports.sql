-- Convert the reporting cycle from monthly to weekly. Run after the earlier
-- project report migrations in the Supabase SQL Editor.
BEGIN;

ALTER TABLE public.projectreports ADD COLUMN IF NOT EXISTS reportweek DATE;
ALTER TABLE public.projectreports ALTER COLUMN reportmonth DROP NOT NULL;
UPDATE public.projectreports
SET reportweek = reportmonth - ((EXTRACT(ISODOW FROM reportmonth)::INTEGER - 1))
WHERE reportweek IS NULL;
ALTER TABLE public.projectreports ALTER COLUMN reportweek SET NOT NULL;
ALTER TABLE public.projectreports
  ADD CONSTRAINT projectreports_reportweek_monday_check
  CHECK (EXTRACT(ISODOW FROM reportweek) = 1) NOT VALID;
ALTER TABLE public.projectreports
  VALIDATE CONSTRAINT projectreports_reportweek_monday_check;
CREATE UNIQUE INDEX IF NOT EXISTS ux_projectreports_project_week
  ON public.projectreports(projectid, reportweek);
CREATE INDEX IF NOT EXISTS ix_projectreports_project_week
  ON public.projectreports(projectid, reportweek DESC);

ALTER TABLE public.projectreportnotifications ADD COLUMN IF NOT EXISTS reportweek DATE;
ALTER TABLE public.projectreportnotifications ALTER COLUMN reportmonth DROP NOT NULL;
UPDATE public.projectreportnotifications
SET reportweek = reportmonth - ((EXTRACT(ISODOW FROM reportmonth)::INTEGER - 1))
WHERE reportweek IS NULL;
ALTER TABLE public.projectreportnotifications
  DROP CONSTRAINT IF EXISTS projectreportnotifications_eventtype_check;
ALTER TABLE public.projectreportnotifications
  ADD CONSTRAINT projectreportnotifications_eventtype_check
  CHECK (eventtype IN (
    'MD_OFFICE_3_DAY_REMINDER', 'MD_OFFICE_1_DAY_REMINDER',
    'OPERATIONS_3_DAY_WEEKLY_REMINDER', 'OPERATIONS_1_DAY_WEEKLY_REMINDER',
    'CLIENT_REPORT_AVAILABLE'
  ));

COMMIT;
