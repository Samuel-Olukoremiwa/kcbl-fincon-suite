BEGIN;

-- ============================================================
-- 1. REPORT TYPE
-- ============================================================

ALTER TABLE public.projectreports
  ADD COLUMN IF NOT EXISTS reporttype VARCHAR(30);

-- Existing reports already drive the current project progress/client
-- workflow, so preserve them as Project Manager reports.
UPDATE public.projectreports
SET reporttype = 'Project Manager'
WHERE reporttype IS NULL;

ALTER TABLE public.projectreports
  ALTER COLUMN reporttype SET DEFAULT 'Project Manager';

ALTER TABLE public.projectreports
  ALTER COLUMN reporttype SET NOT NULL;

ALTER TABLE public.projectreports
  DROP CONSTRAINT IF EXISTS projectreports_reporttype_check;

ALTER TABLE public.projectreports
  ADD CONSTRAINT projectreports_reporttype_check
  CHECK (
    reporttype IN (
      'Supervisor',
      'Project Manager'
    )
  );


-- ============================================================
-- 2. ALLOW MORE THAN ONE REPORT FOR A PROJECT/WEEK
--
-- A Supervisor report and Project Manager report may both exist
-- for the same reporting week.
-- ============================================================

DROP INDEX IF EXISTS public.ux_projectreports_project_week;

CREATE INDEX IF NOT EXISTS ix_projectreports_project_week
  ON public.projectreports (
    projectid,
    reportweek DESC
  );

CREATE INDEX IF NOT EXISTS ix_projectreports_type_status_week
  ON public.projectreports (
    projectid,
    reporttype,
    reviewstatus,
    reportweek DESC
  );


-- ============================================================
-- 3. BACKFILL EXISTING PROJECT MANAGERS INTO ASSIGNMENTS
--
-- projects.projectmanageruserid remains the canonical Project Manager.
-- ============================================================

INSERT INTO public.projectassignments (
  projectid,
  userid,
  assignmentrole,
  assignedbyuserid,
  assignedat,
  approvalstatus,
  authorizedbyuserid,
  authorizedat,
  active
)
SELECT
  p.projectid,
  p.projectmanageruserid,
  'Project Manager',
  p.projectmanageruserid,
  NOW(),
  'Approved',
  p.projectmanageruserid,
  NOW(),
  TRUE
FROM public.projects p
JOIN public.users u
  ON u.userid = p.projectmanageruserid
WHERE p.projectmanageruserid IS NOT NULL
  AND u.usertype = 'Staff'
ON CONFLICT (
  projectid,
  userid,
  assignmentrole
)
DO UPDATE SET
  approvalstatus = 'Approved',
  active = TRUE;


-- ============================================================
-- 4. REPORT MEDIA
-- ============================================================

CREATE TABLE IF NOT EXISTS public.projectreportmedia (
  mediaid BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  reportid BIGINT NOT NULL
    REFERENCES public.projectreports(reportid)
    ON DELETE CASCADE,

  filename VARCHAR(255) NOT NULL,

  storagepath TEXT NOT NULL UNIQUE,

  filesize BIGINT NOT NULL
    CHECK (
      filesize > 0
      AND filesize <= 26214400
    ),

  mimetype VARCHAR(100) NOT NULL
    CHECK (
      mimetype IN (
        'image/jpeg',
        'image/png',
        'image/webp',
        'video/mp4',
        'video/webm'
      )
    ),

  mediatype VARCHAR(10) NOT NULL
    CHECK (
      mediatype IN (
        'Image',
        'Video'
      )
    ),

  uploadedat TIMESTAMPTZ NOT NULL
    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_projectreportmedia_report
  ON public.projectreportmedia(reportid);

ALTER TABLE public.projectreportmedia
  ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 5. PRIVATE MEDIA STORAGE BUCKET
--
-- Per-file bucket limit is 25 MB.
-- Application code will enforce:
-- images: 5 MB
-- videos: 25 MB
-- maximum files/report: 6
-- maximum combined media/report: 50 MB
-- ============================================================

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'project-report-media',
  'project-report-media',
  FALSE,
  26214400,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/webm'
  ]
)
ON CONFLICT (id)
DO UPDATE SET
  public = FALSE,
  file_size_limit = 26214400,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/webm'
  ];


COMMIT;