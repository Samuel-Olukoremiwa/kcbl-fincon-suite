-- KCBL Staff Database / Personnel Records upgrade.
-- Run once in Supabase SQL Editor as postgres.
-- Take a database backup before applying in production.
BEGIN;

CREATE TABLE IF NOT EXISTS public.staffprofiles (
  userid VARCHAR(10) PRIMARY KEY REFERENCES public.users(userid) ON DELETE CASCADE,
  dateofbirth DATE,
  gender VARCHAR(30),
  nationality VARCHAR(80),
  stateoforigin VARCHAR(80),
  localgovernmentarea VARCHAR(120),
  residentialaddress TEXT,

  highestqualification VARCHAR(150),
  institution VARCHAR(180),
  courseofstudy VARCHAR(180),
  yearobtained INTEGER CHECK (yearobtained IS NULL OR yearobtained BETWEEN 1950 AND 2200),
  professionalcertifications TEXT,
  relevantskills TEXT,
  yearsofrelevantexperience NUMERIC(5,1) CHECK (
    yearsofrelevantexperience IS NULL OR yearsofrelevantexperience >= 0
  ),

  mostrecentemployer VARCHAR(180),
  previouspositionheld VARCHAR(150),
  previousemploymentduration VARCHAR(100),
  reasonforleaving TEXT,
  previousprojectexperience TEXT,

  emergencycontactname VARCHAR(150),
  emergencyrelationship VARCHAR(100),
  emergencyphone VARCHAR(40),
  emergencyalternativephone VARCHAR(40),
  emergencyaddress TEXT,

  bankname VARCHAR(120),
  bankaccountname VARCHAR(180),
  bankaccountnumber VARCHAR(30),
  tin VARCHAR(60),

  roletrade VARCHAR(150),
  primaryareaofwork VARCHAR(180),
  safetybootsize VARCHAR(30),
  coverallsize VARCHAR(30),
  reflectivevestsize VARCHAR(30),
  helmetsize VARCHAR(30),
  equipmentandotherskills TEXT,

  declarationconfirmed BOOLEAN NOT NULL DEFAULT FALSE,
  declarationstaffname VARCHAR(180),
  declarationdate DATE,

  datereceived DATE,
  documentsverifiedbyuserid VARCHAR(10) REFERENCES public.users(userid),
  employmentletterissued BOOLEAN NOT NULL DEFAULT FALSE,
  staffidassigned VARCHAR(50),
  ppeissued BOOLEAN NOT NULL DEFAULT FALSE,
  hseinductioncompleted BOOLEAN NOT NULL DEFAULT FALSE,
  stafffilecreated BOOLEAN NOT NULL DEFAULT FALSE,
  medicalresultgood BOOLEAN,
  adminremarks TEXT,

  employmentstatus VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (
    employmentstatus IN ('Active','Probation','Suspended','Resigned','Terminated','Retired')
  ),
  onboardingstatus VARCHAR(20) NOT NULL DEFAULT 'Draft' CHECK (
    onboardingstatus IN ('Draft','Submitted','Verified')
  ),
  onboardingsubmittedat TIMESTAMPTZ,
  onboardingverifiedat TIMESTAMPTZ,
  onboardingverifiedbyuserid VARCHAR(10) REFERENCES public.users(userid),

  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedbyuserid VARCHAR(10) REFERENCES public.users(userid)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_staffprofiles_staffidassigned
  ON public.staffprofiles(staffidassigned)
  WHERE staffidassigned IS NOT NULL AND BTRIM(staffidassigned) <> '';

CREATE INDEX IF NOT EXISTS ix_staffprofiles_onboardingstatus
  ON public.staffprofiles(onboardingstatus);

CREATE INDEX IF NOT EXISTS ix_staffprofiles_employmentstatus
  ON public.staffprofiles(employmentstatus);

CREATE TABLE IF NOT EXISTS public.staffreferences (
  referenceid BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  userid VARCHAR(10) NOT NULL REFERENCES public.users(userid) ON DELETE CASCADE,
  referencenumber SMALLINT NOT NULL CHECK (referencenumber IN (1,2)),
  fullname VARCHAR(180),
  relationshipposition VARCHAR(180),
  organisation VARCHAR(180),
  address TEXT,
  phone VARCHAR(40),
  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(userid, referencenumber)
);

CREATE INDEX IF NOT EXISTS ix_staffreferences_userid
  ON public.staffreferences(userid);

CREATE TABLE IF NOT EXISTS public.staffdocuments (
  documentid BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  userid VARCHAR(10) NOT NULL REFERENCES public.users(userid) ON DELETE CASCADE,
  documenttype VARCHAR(100) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  storagepath TEXT NOT NULL UNIQUE,
  mimetype VARCHAR(100) NOT NULL,
  filesize BIGINT NOT NULL CHECK (filesize > 0),
  uploadedbyuserid VARCHAR(10) NOT NULL REFERENCES public.users(userid),
  uploadedat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  verifiedbyuserid VARCHAR(10) REFERENCES public.users(userid),
  verifiedat TIMESTAMPTZ,
  verificationremarks TEXT
);

CREATE INDEX IF NOT EXISTS ix_staffdocuments_userid
  ON public.staffdocuments(userid, uploadedat DESC);

-- Backfill an empty personnel record for every existing staff account.
INSERT INTO public.staffprofiles (userid)
SELECT u.userid
FROM public.users u
WHERE u.usertype = 'Staff'
ON CONFLICT (userid) DO NOTHING;

-- Private storage bucket for personnel documents.
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'staff-documents',
  'staff-documents',
  FALSE,
  20971520,
  ARRAY['application/pdf','image/jpeg','image/png']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.staffprofiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staffreferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staffdocuments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staffprofiles_self_select ON public.staffprofiles;
CREATE POLICY staffprofiles_self_select
ON public.staffprofiles
FOR SELECT
TO authenticated
USING (
  userid IN (
    SELECT u.userid
    FROM public.users u
    WHERE u.authuserid = auth.uid()
  )
);

DROP POLICY IF EXISTS staffreferences_self_select ON public.staffreferences;
CREATE POLICY staffreferences_self_select
ON public.staffreferences
FOR SELECT
TO authenticated
USING (
  userid IN (
    SELECT u.userid
    FROM public.users u
    WHERE u.authuserid = auth.uid()
  )
);

DROP POLICY IF EXISTS staffdocuments_self_select ON public.staffdocuments;
CREATE POLICY staffdocuments_self_select
ON public.staffdocuments
FOR SELECT
TO authenticated
USING (
  userid IN (
    SELECT u.userid
    FROM public.users u
    WHERE u.authuserid = auth.uid()
  )
);

COMMIT;
