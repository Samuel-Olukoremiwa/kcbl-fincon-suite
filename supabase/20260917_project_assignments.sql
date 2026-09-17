-- Project assignments and progress-report review workflow.
BEGIN;
CREATE TABLE IF NOT EXISTS public.projectassignments (
  assignmentid BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  projectid VARCHAR(10) NOT NULL REFERENCES public.projects(projectid) ON DELETE CASCADE,
  userid VARCHAR(10) NOT NULL REFERENCES public.users(userid) ON DELETE CASCADE,
  assignmentrole VARCHAR(40) NOT NULL CHECK (assignmentrole IN ('Project Manager','Senior Supervisor','Junior Supervisor','QS','Site Engineer','Operations Staff')),
  assignedbyuserid VARCHAR(10) NOT NULL REFERENCES public.users(userid),
  assignedat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approvalstatus VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (approvalstatus IN ('Pending','Approved','Rejected')),
  authorizedbyuserid VARCHAR(10) REFERENCES public.users(userid),
  authorizedat TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(projectid, userid, assignmentrole)
);
ALTER TABLE public.projectreports ADD COLUMN IF NOT EXISTS submittedbyuserid VARCHAR(10) REFERENCES public.users(userid);
ALTER TABLE public.projectreports ADD COLUMN IF NOT EXISTS supervisorreviewedbyuserid VARCHAR(10) REFERENCES public.users(userid);
ALTER TABLE public.projectreports ADD COLUMN IF NOT EXISTS supervisorreviewedat TIMESTAMPTZ;
ALTER TABLE public.projectreports ADD COLUMN IF NOT EXISTS supervisorcomments TEXT;
ALTER TABLE public.projectreports ADD COLUMN IF NOT EXISTS authorizedbyuserid VARCHAR(10) REFERENCES public.users(userid);
ALTER TABLE public.projectreports ADD COLUMN IF NOT EXISTS authorizedat TIMESTAMPTZ;
ALTER TABLE public.projectreports ADD COLUMN IF NOT EXISTS progresspct NUMERIC(5,2) CHECK (progresspct >= 0 AND progresspct <= 100);
ALTER TABLE public.projectreports ADD COLUMN IF NOT EXISTS reviewstatus VARCHAR(20) NOT NULL DEFAULT 'Submitted' CHECK (reviewstatus IN ('Submitted','Reviewed','Authorized','Rejected'));
COMMIT;
