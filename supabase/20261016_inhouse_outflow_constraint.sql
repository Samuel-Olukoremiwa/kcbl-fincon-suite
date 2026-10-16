-- KCBL FinCon Suite
-- Allow In-House outflow records to have no supplier/subcontractor payee.
--
-- Supplier:       supplierid set, subcontractorid null
-- Subcontractor:  supplierid null, subcontractorid set
-- In-House:       both null
--
-- The only invalid state is having BOTH supplierid and subcontractorid set.

BEGIN;

ALTER TABLE public.cashoutflowexpenditure
  DROP CONSTRAINT IF EXISTS chk_cashoutflow_payeeexclusive;

ALTER TABLE public.cashoutflowexpenditure
  ADD CONSTRAINT chk_cashoutflow_payeeexclusive
  CHECK (
    NOT (
      supplierid IS NOT NULL
      AND subcontractorid IS NOT NULL
    )
  );

COMMIT;
