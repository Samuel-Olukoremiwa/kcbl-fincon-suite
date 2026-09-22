-- KCBL FinCon Suite
-- Staff onboarding-first workflow
--
-- Purpose:
-- 1. Allow a staff/personnel record to exist before a FinCon Suite login exists.
-- 2. Preserve existing users and staffprofiles.
-- 3. Allow a verified onboarding record to be converted into a system user later.
--
-- Run once in Supabase SQL Editor as postgres.

BEGIN;

CREATE TABLE IF NOT EXISTS public.staffonboarding (
  onboardingid BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Identity / contact collected before a system account exists.
  fullname VARCHAR(180) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phonenumber VARCHAR(40) NOT NULL,

  -- Personal information.
  dateofbirth DATE,
  gender VARCHAR(30),
  nationality VARCHAR(80),
  stateoforigin VARCHAR(80),
  localgovernmentarea VARCHAR(120),
  residentialaddress TEXT,

  -- Education / professional information.
  highestqualification VARCHAR(150),
  institution VARCHAR(180),
  courseofstudy VARCHAR(180),
  yearobtained INTEGER CHECK (
    yearobtained IS NULL OR yearobtained BETWEEN 1950 AND 2200
  ),
  professionalcertifications TEXT,
  relevantskills TEXT,
  yearsofrelevantexperience NUMERIC(5,1) CHECK (
    yearsofrelevantexperience IS NULL OR yearsofrelevantexperience >= 0
  ),

  -- Previous employment.
  mostrecentemployer VARCHAR(180),
  previouspositionheld VARCHAR(150),
  previousemploymentduration VARCHAR(100),
  reasonforleaving TEXT,
  previousprojectexperience TEXT,

  -- Emergency contact.
  emergencycontactname VARCHAR(150),
  emergencyrelationship VARCHAR(100),
  emergencyphone VARCHAR(40),
  emergencyalternativephone VARCHAR(40),
  emergencyaddress TEXT,

  -- Sensitive finance / payroll information.
  bankname VARCHAR(120),
  bankaccountname VARCHAR(180),
  bankaccountnumber VARCHAR(30),
  tin VARCHAR(60),

  -- Site / PPE information.
  roletrade VARCHAR(150),
  primaryareaofwork VARCHAR(180),
  safetybootsize VARCHAR(30),
  coverallsize VARCHAR(30),
  reflectivevestsize VARCHAR(30),
  helmetsize VARCHAR(30),
  equipmentandotherskills TEXT,

  -- Declaration.
  declarationconfirmed BOOLEAN NOT NULL DEFAULT FALSE,
  declarationstaffname VARCHAR(180),
  declarationdate DATE,

  -- KCBL admin / verification fields.
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
    employmentstatus IN (
      'Active',
      'Probation',
      'Suspended',
      'Resigned',
      'Terminated',
      'Retired'
    )
  ),

  onboardingstatus VARCHAR(30) NOT NULL DEFAULT 'Draft' CHECK (
    onboardingstatus IN (
      'Draft',
      'Submitted',
      'Verified',
      'Account Created'
    )
  ),

  onboardingsubmittedat TIMESTAMPTZ,
  onboardingverifiedat TIMESTAMPTZ,
  onboardingverifiedbyuserid VARCHAR(10) REFERENCES public.users(userid),

  -- Populated only after a FinCon Suite user account has been created.
  createduserid VARCHAR(10) UNIQUE REFERENCES public.users(userid),
  accountcreatedat TIMESTAMPTZ,
  accountcreatedbyuserid VARCHAR(10) REFERENCES public.users(userid),

  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  createdbyuserid VARCHAR(10) REFERENCES public.users(userid),
  updatedat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedbyuserid VARCHAR(10) REFERENCES public.users(userid)
);

CREATE INDEX IF NOT EXISTS ix_staffonboarding_status
  ON public.staffonboarding(onboardingstatus, createdat DESC);

CREATE INDEX IF NOT EXISTS ix_staffonboarding_email
  ON public.staffonboarding(LOWER(email));

CREATE INDEX IF NOT EXISTS ix_staffonboarding_createduserid
  ON public.staffonboarding(createduserid)
  WHERE createduserid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_staffonboarding_staffidassigned
  ON public.staffonboarding(staffidassigned)
  WHERE staffidassigned IS NOT NULL AND BTRIM(staffidassigned) <> '';

CREATE TABLE IF NOT EXISTS public.staffonboardingreferences (
  referenceid BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  onboardingid BIGINT NOT NULL
    REFERENCES public.staffonboarding(onboardingid) ON DELETE CASCADE,
  referencenumber SMALLINT NOT NULL CHECK (referencenumber IN (1,2)),
  fullname VARCHAR(180),
  relationshipposition VARCHAR(180),
  organisation VARCHAR(180),
  address TEXT,
  phone VARCHAR(40),
  createdat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updatedat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(onboardingid, referencenumber)
);

CREATE INDEX IF NOT EXISTS ix_staffonboardingreferences_onboardingid
  ON public.staffonboardingreferences(onboardingid);

CREATE TABLE IF NOT EXISTS public.staffonboardingdocuments (
  documentid BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  onboardingid BIGINT NOT NULL
    REFERENCES public.staffonboarding(onboardingid) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS ix_staffonboardingdocuments_onboardingid
  ON public.staffonboardingdocuments(onboardingid, uploadedat DESC);

-- Ensure the existing private staff document bucket is available for
-- pre-account onboarding documents as well.
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

-- Backfill one registry row for existing staff accounts so they remain
-- represented in the new onboarding-first Staff Database. Their detailed
-- existing personnel records remain in staffprofiles and are not replaced.
INSERT INTO public.staffonboarding (
  fullname,
  email,
  phonenumber,
  staffidassigned,
  employmentstatus,
  onboardingstatus,
  createduserid,
  accountcreatedat,
  createdat,
  updatedat
)
SELECT
  u.fullname,
  COALESCE(u.email, u.loginemail, ''),
  COALESCE(u.phonenumber, ''),
  sp.staffidassigned,
  COALESCE(sp.employmentstatus, 'Active'),
  'Account Created',
  u.userid,
  NOW(),
  NOW(),
  NOW()
FROM public.users u
LEFT JOIN public.staffprofiles sp
  ON sp.userid = u.userid
WHERE u.usertype = 'Staff'
  AND NOT EXISTS (
    SELECT 1
    FROM public.staffonboarding so
    WHERE so.createduserid = u.userid
  );

ALTER TABLE public.staffonboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staffonboardingreferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staffonboardingdocuments ENABLE ROW LEVEL SECURITY;

-- These tables are intentionally accessed through server-side APIs/pages
-- using the service-role client after application permission checks.
-- No broad authenticated RLS policies are added here because the records can
-- contain payroll, identification and medical/admin information.

COMMIT;
