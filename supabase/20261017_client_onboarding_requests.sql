-- KCBL FinCon Suite
-- Business Development client onboarding Maker-Checker workflow.
--
-- Initiator submits a pending onboarding request.
-- Authorizer reviews and approves/rejects.
-- The actual client + Client Portal account are created only after approval.

BEGIN;

CREATE TABLE IF NOT EXISTS public.clientonboardingrequests (
  requestid BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  requestpayload JSONB NOT NULL,

  status VARCHAR(20) NOT NULL
    DEFAULT 'Pending'
    CHECK (
      status IN (
        'Pending',
        'Approved',
        'Rejected'
      )
    ),

  requestedbyuserid VARCHAR(10) NOT NULL
    REFERENCES public.users(userid),

  requestedat TIMESTAMPTZ NOT NULL
    DEFAULT NOW(),

  reviewedbyuserid VARCHAR(10)
    REFERENCES public.users(userid),

  reviewedat TIMESTAMPTZ,

  reviewcomments TEXT,

  approvedclientid VARCHAR(10)
    REFERENCES public.clients(clientid)
);

CREATE INDEX IF NOT EXISTS ix_clientonboardingrequests_status_date
  ON public.clientonboardingrequests (
    status,
    requestedat DESC
  );

CREATE INDEX IF NOT EXISTS ix_clientonboardingrequests_maker
  ON public.clientonboardingrequests (
    requestedbyuserid,
    requestedat DESC
  );

CREATE UNIQUE INDEX IF NOT EXISTS ux_clientonboardingrequests_pending_email
  ON public.clientonboardingrequests (
    LOWER(requestpayload ->> 'email')
  )
  WHERE status = 'Pending';

ALTER TABLE public.clientonboardingrequests
  ENABLE ROW LEVEL SECURITY;

COMMIT;
