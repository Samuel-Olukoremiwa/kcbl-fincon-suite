BEGIN;

-- ============================================================
-- 1. REPORT TYPE
-- ============================================================
-- Only Project Manager reports are client-facing progress reports.
-- Every other approved Operations assignment produces an internal
-- Operations report that is reviewed/approved by the Project Manager.

ALTER TABLE public.projectreports
  ADD COLUMN IF NOT EXISTS reporttype VARCHAR(30);

-- Preserve existing reports as the current client-facing progress history.
-- If the earlier draft migration was already run, convert its old
-- "Supervisor" value to the final "Operations" value.
UPDATE public.projectreports
SET reporttype = 'Operations'
WHERE reporttype = 'Supervisor';

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
      'Operations',
      'Project Manager'
    )
  );

-- ============================================================
-- 2. ALLOW MORE THAN ONE REPORT FOR A PROJECT/WEEK
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

  filesize BIGINT NOT NULL,

  mimetype VARCHAR(100) NOT NULL,

  mediatype VARCHAR(10) NOT NULL,

  uploadedat TIMESTAMPTZ NOT NULL
    DEFAULT NOW()
);

-- Upgrade safely if the earlier draft media table already exists.
ALTER TABLE public.projectreportmedia
  DROP CONSTRAINT IF EXISTS projectreportmedia_filesize_check;

ALTER TABLE public.projectreportmedia
  DROP CONSTRAINT IF EXISTS projectreportmedia_mimetype_check;

ALTER TABLE public.projectreportmedia
  DROP CONSTRAINT IF EXISTS projectreportmedia_mediatype_check;

ALTER TABLE public.projectreportmedia
  DROP CONSTRAINT IF EXISTS projectreportmedia_type_size_check;

ALTER TABLE public.projectreportmedia
  ADD CONSTRAINT projectreportmedia_type_size_check
  CHECK (
    filesize > 0
    AND
    (
      (
        mediatype = 'Image'
        AND mimetype IN (
          'image/jpeg',
          'image/png',
          'image/webp'
        )
        AND filesize <= 5242880
      )
      OR
      (
        mediatype = 'Video'
        AND mimetype IN (
          'video/mp4',
          'video/webm'
        )
        AND filesize <= 26214400
      )
    )
  );

CREATE INDEX IF NOT EXISTS ix_projectreportmedia_report
  ON public.projectreportmedia(reportid);

ALTER TABLE public.projectreportmedia
  ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. HARD LIMITS PER REPORT
-- Maximum 6 media files and 50 MB combined.
-- Lock the parent report row so concurrent inserts cannot bypass
-- the per-report aggregate limits.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_projectreportmedia_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  existing_count INTEGER;
  existing_bytes BIGINT;
BEGIN
  PERFORM 1
  FROM public.projectreports
  WHERE reportid = NEW.reportid
  FOR UPDATE;

  SELECT
    COUNT(*),
    COALESCE(SUM(filesize), 0)
  INTO
    existing_count,
    existing_bytes
  FROM public.projectreportmedia
  WHERE reportid = NEW.reportid;

  IF existing_count >= 6 THEN
    RAISE EXCEPTION
      'A report may contain a maximum of 6 media files.';
  END IF;

  IF existing_bytes + NEW.filesize > 52428800 THEN
    RAISE EXCEPTION
      'Combined report media may not exceed 50 MB.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projectreportmedia_limits
  ON public.projectreportmedia;

CREATE TRIGGER trg_projectreportmedia_limits
BEFORE INSERT ON public.projectreportmedia
FOR EACH ROW
EXECUTE FUNCTION public.enforce_projectreportmedia_limits();

REVOKE ALL
ON FUNCTION public.enforce_projectreportmedia_limits()
FROM PUBLIC;

-- ============================================================
-- 6. PRIVATE MEDIA STORAGE BUCKET
-- Images: JPG/PNG/WebP <= 5 MB each
-- Videos: MP4/WebM <= 25 MB each
-- Application + DB enforce max 6 files and 50 MB total/report.
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
