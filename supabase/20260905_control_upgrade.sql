-- KCBL control upgrade. Run once in Supabase SQL Editor as postgres.
-- Take a database backup before applying in production.
BEGIN;

-- 1. Rename the existing workflow roles, then add the matrix roles.
UPDATE public.roles SET rolename = 'Initiator' WHERE rolename = 'Maker';
UPDATE public.roles SET rolename = 'Authorizer' WHERE rolename = 'Checker';
UPDATE public.roles SET rolename = 'Super User' WHERE rolename = 'Super Admin';
INSERT INTO public.roles (rolename) VALUES
  ('MD'), ('MD Office'), ('Executive Director'), ('Non-Executive Director'),
  ('Finance & Admin'), ('Business Development'), ('Operations'), ('Internal Control')
ON CONFLICT (rolename) DO NOTHING;

-- 2. Staff records carry the department and approved access level from the matrix.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS department VARCHAR(80);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS accesslevel VARCHAR(20) NOT NULL DEFAULT 'Read Only';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS loginemail VARCHAR(100);
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_accesslevel_check;
ALTER TABLE public.users ADD CONSTRAINT users_accesslevel_check CHECK (accesslevel IN ('Read & Write', 'Read Only'));
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_loginemail ON public.users(loginemail) WHERE loginemail IS NOT NULL;

-- 3. KYC additions and revised client types.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS othertype VARCHAR(80);
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS idissuedate DATE;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS verificationpersonname VARCHAR(100);
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS verificationpersonposition VARCHAR(100);
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS chk_clients_clienttype;
ALTER TABLE public.clients ADD CONSTRAINT chk_clients_clienttype CHECK (clienttype IN ('Corporate','Federal Government','State Government','Local Government','SME','Others','Individual'));

-- 4. Flexible, supervised transaction categories.
CREATE TABLE IF NOT EXISTS public.transactioncategories (
  categoryid BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  categoryname VARCHAR(100) NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  isinhouse BOOLEAN NOT NULL DEFAULT FALSE,
  createdbyuserid VARCHAR(10) REFERENCES public.users(userid),
  datecreated DATE NOT NULL DEFAULT CURRENT_DATE
);
INSERT INTO public.transactioncategories (categoryname, isinhouse) VALUES
 ('Salaries', TRUE), ('Travel Allowance', TRUE), ('Transport Fare', TRUE),
 ('Leave Allowance', TRUE), ('Investment', TRUE), ('Redemption', TRUE),
 ('Out-of-Station Allowance', TRUE), ('Vehicle/Equipment/Machine/Computer Maintenance', TRUE),
 ('Materials', FALSE), ('Labor', FALSE), ('Equipment', FALSE), ('Other', FALSE)
ON CONFLICT (categoryname) DO NOTHING;
ALTER TABLE public.cashoutflowexpenditure DROP CONSTRAINT IF EXISTS chk_cashoutflow_category;

-- 5. January–December financial-year periods, half-year archiving, settings approval.
CREATE TABLE IF NOT EXISTS public.systemsettings (
  settingkey VARCHAR(80) PRIMARY KEY,
  settingvalue JSONB NOT NULL,
  updatedbyuserid VARCHAR(10) REFERENCES public.users(userid),
  updatedat TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO public.systemsettings (settingkey, settingvalue) VALUES
 ('session_timeout_minutes', '5'::jsonb),
 ('financial_year_start_month', '1'::jsonb)
ON CONFLICT (settingkey) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.sessiontimeoutrequests (
  requestid BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  requestedminutes INTEGER NOT NULL CHECK (requestedminutes BETWEEN 1 AND 120),
  requestedbyuserid VARCHAR(10) NOT NULL REFERENCES public.users(userid),
  status VARCHAR(15) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Rejected')),
  reviewedbyuserid VARCHAR(10) REFERENCES public.users(userid),
  reviewcomments VARCHAR(255),
  requestedat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewedat TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.archivebatches (
  archiveid BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  financialyear INTEGER NOT NULL,
  halfyear SMALLINT NOT NULL CHECK (halfyear IN (1,2)),
  archivedat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archivedbyuserid VARCHAR(10) NOT NULL REFERENCES public.users(userid),
  UNIQUE(financialyear, halfyear)
);
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS archiveid BIGINT REFERENCES public.archivebatches(archiveid);
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS archiveid BIGINT REFERENCES public.archivebatches(archiveid);
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS archiveid BIGINT REFERENCES public.archivebatches(archiveid);
ALTER TABLE public.subcontractors ADD COLUMN IF NOT EXISTS archiveid BIGINT REFERENCES public.archivebatches(archiveid);
ALTER TABLE public.cashinflowreceivables ADD COLUMN IF NOT EXISTS archiveid BIGINT REFERENCES public.archivebatches(archiveid);
ALTER TABLE public.cashoutflowexpenditure ADD COLUMN IF NOT EXISTS archiveid BIGINT REFERENCES public.archivebatches(archiveid);

-- 6. One protected in-house client/project keeps Project mandatory.
INSERT INTO public.clients (clientid, clienttype, fullnameorcompanyname, address, phonenumber, email, preferredpaymentmethod, declarationclientname, declarationdate, createdby)
SELECT 'CLI00000','Others','KCBL Internal','Internal','00000000000','internal@kcbl.local','Bank Transfer','System',CURRENT_DATE,u.userid
FROM public.users u ORDER BY u.userid LIMIT 1
ON CONFLICT (clientid) DO NOTHING;
INSERT INTO public.projects (projectid, clientid, projecttitle, projectlocation, projecttype, estimatedvalue, status)
VALUES ('PRJ00000','CLI00000','In-House Transactions','Internal','Other',1,'In Progress')
ON CONFLICT (projectid) DO NOTHING;
UPDATE public.cashinflowreceivables SET projectid = 'PRJ00000' WHERE projectid IS NULL;
UPDATE public.cashinflowreceivables SET description = 'Not provided' WHERE description IS NULL OR BTRIM(description) = '';
UPDATE public.cashoutflowexpenditure SET description = 'Not provided' WHERE description IS NULL OR BTRIM(description) = '';
ALTER TABLE public.cashinflowreceivables ALTER COLUMN projectid SET NOT NULL;
ALTER TABLE public.cashinflowreceivables ALTER COLUMN description SET NOT NULL;
ALTER TABLE public.cashoutflowexpenditure ALTER COLUMN description SET NOT NULL;

COMMIT;
