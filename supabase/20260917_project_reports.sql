-- KCBL monthly project reporting. Run once in the Supabase SQL Editor as postgres.
-- The reports bucket remains private; signed URLs are issued only after the
-- application verifies a logged-in user's project ownership.
BEGIN;

CREATE TABLE IF NOT EXISTS public.projectreports (
  reportid BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  projectid VARCHAR(10) NOT NULL REFERENCES public.projects(projectid) ON DELETE RESTRICT,
  reportmonth DATE NOT NULL CHECK (reportmonth = date_trunc('month', reportmonth)::date),
  filename VARCHAR(255) NOT NULL,
  storagepath TEXT NOT NULL UNIQUE,
  filesize BIGINT NOT NULL CHECK (filesize > 0 AND filesize <= 104857600),
  uploadedbyuserid VARCHAR(10) NOT NULL REFERENCES public.users(userid) ON DELETE RESTRICT,
  uploadedat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clientnotifiedat TIMESTAMPTZ,
  UNIQUE(projectid, reportmonth)
);
CREATE INDEX IF NOT EXISTS ix_projectreports_project_month ON public.projectreports(projectid, reportmonth DESC);

CREATE TABLE IF NOT EXISTS public.projectreportnotifications (
  notificationid BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  notificationkey VARCHAR(180) NOT NULL UNIQUE,
  eventtype VARCHAR(40) NOT NULL CHECK (eventtype IN ('MD_OFFICE_3_DAY_REMINDER', 'MD_OFFICE_1_DAY_REMINDER', 'CLIENT_REPORT_AVAILABLE')),
  reportmonth DATE NOT NULL,
  reportid BIGINT REFERENCES public.projectreports(reportid) ON DELETE CASCADE,
  recipientemail VARCHAR(255) NOT NULL,
  sentat TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('project-reports', 'project-reports', FALSE, 104857600, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = FALSE, file_size_limit = 104857600, allowed_mime_types = ARRAY['application/pdf'];

ALTER TABLE public.projectreports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projectreportnotifications ENABLE ROW LEVEL SECURITY;
COMMIT;
