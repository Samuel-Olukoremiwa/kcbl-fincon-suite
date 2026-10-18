BEGIN;

-- Allow individual expense categories to be shared
-- across Supplier, Subcontractor and In-House expenses.
ALTER TABLE public.transactioncategories
ADD COLUMN IF NOT EXISTS availableforall
BOOLEAN NOT NULL DEFAULT FALSE;

-- Keep the existing Logistics category; do not duplicate it.
UPDATE public.transactioncategories
SET availableforall = TRUE,
    active = TRUE
WHERE categoryname = 'Logistics';

-- Replace the existing breakdown validation function.
-- The trigger already points to this function.
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
  category_is_shared boolean;
  idx integer := 0;
BEGIN
  -- Preserve compatibility with older transactions.
  IF NEW.expensebreakdown IS NULL THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.expensebreakdown) <> 'array'
     OR jsonb_array_length(NEW.expensebreakdown)
        NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION
      'Expense breakdown must contain 1 to 30 categories';
  END IF;

  IF NEW.expensepayeetype IS NULL
     OR NEW.expensepayeetype NOT IN
        ('Supplier', 'Subcontractor', 'In-House') THEN
    RAISE EXCEPTION 'Valid expense payee type is required';
  END IF;

  is_internal := (NEW.expensepayeetype = 'In-House');

  IF
    (
      is_internal
      AND (
        NEW.supplierid IS NOT NULL
        OR NEW.subcontractorid IS NOT NULL
      )
    )
    OR (
      NEW.expensepayeetype = 'Supplier'
      AND NEW.subcontractorid IS NOT NULL
    )
    OR (
      NEW.expensepayeetype = 'Subcontractor'
      AND NEW.supplierid IS NOT NULL
    )
  THEN
    RAISE EXCEPTION
      'Expense payee type conflicts with linked payee';
  END IF;

  FOR item IN
    SELECT value
    FROM jsonb_array_elements(NEW.expensebreakdown)
  LOOP
    idx := idx + 1;

    category_text :=
      btrim(COALESCE(item->>'category', ''));

    raw_amount := item->>'amount';

    IF category_text = ''
       OR category_text = ANY(seen) THEN
      RAISE EXCEPTION
        'Expense categories must be nonempty and unique';
    END IF;

    IF raw_amount IS NULL
       OR raw_amount !~
          '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$' THEN
      RAISE EXCEPTION 'Invalid category amount';
    END IF;

    line_amount := raw_amount::numeric;

    IF line_amount <= 0
       OR line_amount > 9999999999999999 THEN
      RAISE EXCEPTION
        'Each category amount must be positive and within range';
    END IF;

    SELECT
      tc.isinhouse,
      tc.availableforall
    INTO
      category_is_internal,
      category_is_shared
    FROM public.transactioncategories tc
    WHERE tc.categoryname = category_text
      AND tc.active = TRUE;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Inactive or unknown expense category: %',
        category_text;
    END IF;

    -- Shared categories are valid for all three payee types.
    -- Other categories retain their existing classification.
    IF NOT category_is_shared
       AND category_is_internal IS DISTINCT FROM is_internal THEN
      RAISE EXCEPTION
        'Expense category not available for this payee type: %',
        category_text;
    END IF;

    IF idx = 1
       AND NEW.expenditurecategory
           IS DISTINCT FROM category_text THEN
      RAISE EXCEPTION
        'Primary category must match first category line';
    END IF;

    sum_amount := sum_amount + line_amount;

    seen := array_append(seen, category_text);
  END LOOP;

  IF round(sum_amount, 2)
     IS DISTINCT FROM round(NEW.amount::numeric, 2) THEN
    RAISE EXCEPTION
      'Category allocation total must match expense total';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;