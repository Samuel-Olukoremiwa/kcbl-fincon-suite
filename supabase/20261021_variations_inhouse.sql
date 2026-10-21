BEGIN;
CREATE TABLE IF NOT EXISTS public.kcbl_variations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 projectid text NOT NULL REFERENCES public.projects(projectid),
 description text NOT NULL CHECK (length(btrim(description)) > 0),
 amount numeric(18,2) NOT NULL CHECK (amount > 0),
 approvalstatus text NOT NULL DEFAULT 'Pending' CHECK (approvalstatus IN ('Pending','Approved','Rejected')),
 createdbyuserid text NOT NULL,
 approvedbyuserid text,
 approvedat timestamptz,
 rejectionreason text,
 createdat timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_kcbl_variations_project ON public.kcbl_variations(projectid,createdat DESC);
CREATE TABLE IF NOT EXISTS public.kcbl_variation_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 variationid uuid NOT NULL REFERENCES public.kcbl_variations(id) ON DELETE RESTRICT,
 paymentdate date NOT NULL,
 amount numeric(18,2) NOT NULL CHECK(amount>0),
 reference text,
 notes text,
 createdbyuserid text NOT NULL,
 createdat timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_kcbl_variation_payments_var ON public.kcbl_variation_payments(variationid);
CREATE TABLE IF NOT EXISTS public.kcbl_company_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 entrydate date NOT NULL,
 direction text NOT NULL CHECK(direction IN ('Inflow','Outflow')),
 amount numeric(18,2) NOT NULL CHECK(amount>0),
 category text NOT NULL CHECK(length(btrim(category))>0),
 description text NOT NULL CHECK(length(btrim(description))>0),
 projectid text REFERENCES public.projects(projectid),
 transferreference text,
 approvalstatus text NOT NULL DEFAULT 'Pending' CHECK(approvalstatus IN ('Pending','Approved','Rejected')),
 createdbyuserid text NOT NULL,
 approvedbyuserid text,
 approvedat timestamptz,
 rejectionreason text,
 createdat timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_kcbl_company_entries_status ON public.kcbl_company_entries(approvalstatus,entrydate DESC);
-- App endpoints use the server-side service role only after authorization checks.
ALTER TABLE public.kcbl_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kcbl_variation_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kcbl_company_entries ENABLE ROW LEVEL SECURITY;

-- Atomic payment insertion protects against concurrent overpayments.
CREATE OR REPLACE FUNCTION public.kcbl_add_variation_payment(
 p_variationid uuid, p_date date, p_amount numeric,
 p_reference text, p_notes text, p_userid text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.kcbl_variations%ROWTYPE; paid numeric; newid uuid;
BEGIN
 IF p_amount IS NULL OR p_amount <= 0 OR p_date IS NULL OR p_userid IS NULL THEN
  RAISE EXCEPTION 'Invalid variation payment'; END IF;
 SELECT * INTO v FROM public.kcbl_variations WHERE id=p_variationid FOR UPDATE;
 IF NOT FOUND OR v.approvalstatus <> 'Approved' THEN
  RAISE EXCEPTION 'Only approved variations can receive payments'; END IF;
 SELECT COALESCE(SUM(amount),0) INTO paid FROM public.kcbl_variation_payments WHERE variationid=p_variationid;
 IF paid+p_amount > v.amount THEN RAISE EXCEPTION 'Payment exceeds outstanding variation balance'; END IF;
 INSERT INTO public.kcbl_variation_payments(variationid,paymentdate,amount,reference,notes,createdbyuserid)
 VALUES(p_variationid,p_date,p_amount,p_reference,p_notes,p_userid) RETURNING id INTO newid;
 RETURN newid;
END $$;
REVOKE ALL ON FUNCTION public.kcbl_add_variation_payment(uuid,date,numeric,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.kcbl_add_variation_payment(uuid,date,numeric,text,text,text) TO service_role;
COMMIT;
