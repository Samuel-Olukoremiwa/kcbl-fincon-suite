-- KCBL FinCon Suite
-- Supplier/Subcontractor multi-category support
BEGIN;

ALTER TABLE public.suppliers
  ALTER COLUMN supplycategory DROP DEFAULT;

ALTER TABLE public.suppliers
  ALTER COLUMN supplycategory TYPE TEXT[]
  USING (
    CASE
      WHEN supplycategory IS NULL OR BTRIM(supplycategory::TEXT) = ''
      THEN ARRAY[]::TEXT[]
      ELSE ARRAY[BTRIM(supplycategory::TEXT)]
    END
  );

ALTER TABLE public.suppliers
  ALTER COLUMN supplycategory SET DEFAULT ARRAY[]::TEXT[];

ALTER TABLE public.subcontractors
  ALTER COLUMN tradespecialty DROP DEFAULT;

ALTER TABLE public.subcontractors
  ALTER COLUMN tradespecialty TYPE TEXT[]
  USING (
    CASE
      WHEN tradespecialty IS NULL OR BTRIM(tradespecialty::TEXT) = ''
      THEN ARRAY[]::TEXT[]
      ELSE ARRAY[BTRIM(tradespecialty::TEXT)]
    END
  );

ALTER TABLE public.subcontractors
  ALTER COLUMN tradespecialty SET DEFAULT ARRAY[]::TEXT[];

UPDATE public.recordeditrequests
SET changes = JSONB_SET(
  changes,
  '{supplycategory}',
  JSONB_BUILD_ARRAY(changes ->> 'supplycategory'),
  FALSE
)
WHERE entitytype = 'supplier'
  AND changes ? 'supplycategory'
  AND JSONB_TYPEOF(changes -> 'supplycategory') = 'string';

UPDATE public.recordeditrequests
SET previousvalues = JSONB_SET(
  previousvalues,
  '{supplycategory}',
  JSONB_BUILD_ARRAY(previousvalues ->> 'supplycategory'),
  FALSE
)
WHERE entitytype = 'supplier'
  AND previousvalues ? 'supplycategory'
  AND JSONB_TYPEOF(previousvalues -> 'supplycategory') = 'string';

UPDATE public.recordeditrequests
SET changes = JSONB_SET(
  changes,
  '{tradespecialty}',
  JSONB_BUILD_ARRAY(changes ->> 'tradespecialty'),
  FALSE
)
WHERE entitytype = 'subcontractor'
  AND changes ? 'tradespecialty'
  AND JSONB_TYPEOF(changes -> 'tradespecialty') = 'string';

UPDATE public.recordeditrequests
SET previousvalues = JSONB_SET(
  previousvalues,
  '{tradespecialty}',
  JSONB_BUILD_ARRAY(previousvalues ->> 'tradespecialty'),
  FALSE
)
WHERE entitytype = 'subcontractor'
  AND previousvalues ? 'tradespecialty'
  AND JSONB_TYPEOF(previousvalues -> 'tradespecialty') = 'string';

COMMIT;
