-- Run BEFORE deploying the new UI/API.
-- Each outflow remains one approvable transaction; breakdown is retained as JSONB.
ALTER TABLE public.cashoutflowexpenditure
  ADD COLUMN IF NOT EXISTS expensepayeetype text,
  ADD COLUMN IF NOT EXISTS expensebreakdown jsonb;

ALTER TABLE public.cashoutflowexpenditure
  DROP CONSTRAINT IF EXISTS kcbl_expensepayeetype_valid;
ALTER TABLE public.cashoutflowexpenditure
  ADD CONSTRAINT kcbl_expensepayeetype_valid
  CHECK (expensepayeetype IS NULL OR expensepayeetype IN ('Supplier','Subcontractor','In-House'));

CREATE OR REPLACE FUNCTION public.kcbl_validate_expense_breakdown()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  item jsonb;
  category_text text;
  raw_amount text;
  line_amount numeric;
  sum_amount numeric := 0;
  seen text[] := ARRAY[]::text[];
  is_internal boolean;
  category_is_internal boolean;
  idx integer := 0;
BEGIN
  IF NEW.expensebreakdown IS NULL THEN
    RETURN NEW; -- legacy rows remain valid
  END IF;
  IF jsonb_typeof(NEW.expensebreakdown) <> 'array'
    OR jsonb_array_length(NEW.expensebreakdown) NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'Expense breakdown must contain 1 to 30 categories';
  END IF;
  IF NEW.expensepayeetype IS NULL THEN
    RAISE EXCEPTION 'Expense payee type is required for multi-category entries';
  END IF;
  is_internal := (NEW.expensepayeetype = 'In-House');
  IF (is_internal AND (NEW.supplierid IS NOT NULL OR NEW.subcontractorid IS NOT NULL))
     OR (NEW.expensepayeetype = 'Supplier' AND NEW.subcontractorid IS NOT NULL)
     OR (NEW.expensepayeetype = 'Subcontractor' AND NEW.supplierid IS NOT NULL) THEN
    RAISE EXCEPTION 'Expense payee type conflicts with linked payee';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(NEW.expensebreakdown)
  LOOP
    idx := idx + 1;
    category_text := btrim(coalesce(item->>'category',''));
    raw_amount := item->>'amount';
    IF category_text = '' OR category_text = ANY(seen) THEN
      RAISE EXCEPTION 'Expense categories must be nonempty and unique';
    END IF;
    IF raw_amount IS NULL OR raw_amount !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$' THEN
      RAISE EXCEPTION 'Invalid category amount';
    END IF;
    line_amount := raw_amount::numeric;
    IF line_amount <= 0 OR line_amount > 9999999999999999 THEN
      RAISE EXCEPTION 'Each category amount must be positive and within range';
    END IF;
    SELECT tc.isinhouse INTO category_is_internal
    FROM public.transactioncategories tc
    WHERE tc.categoryname = category_text AND tc.active = true;
    IF NOT FOUND OR category_is_internal IS DISTINCT FROM is_internal THEN
      RAISE EXCEPTION 'Inactive or mismatched expense category: %',category_text;
    END IF;
    IF idx = 1 AND NEW.expenditurecategory IS DISTINCT FROM category_text THEN
      RAISE EXCEPTION 'Primary category must match first category line';
    END IF;
    sum_amount := sum_amount + line_amount;
    seen := array_append(seen,category_text);
  END LOOP;
  IF round(sum_amount,2) IS DISTINCT FROM round(NEW.amount::numeric,2) THEN
    RAISE EXCEPTION 'Category allocation total must match expense total';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_kcbl_validate_expense_breakdown ON public.cashoutflowexpenditure;
CREATE TRIGGER trg_kcbl_validate_expense_breakdown
BEFORE INSERT OR UPDATE OF expensebreakdown, expensepayeetype, amount, expenditurecategory
ON public.cashoutflowexpenditure
FOR EACH ROW EXECUTE FUNCTION public.kcbl_validate_expense_breakdown();

COMMENT ON COLUMN public.cashoutflowexpenditure.expensebreakdown IS
'Array of {category,amount} objects; sum must equal the parent expense amount.';
