BEGIN;
-- Add approvals to new variation payments. Existing payments retain Approved status.
ALTER TABLE public.kcbl_variation_payments ADD COLUMN IF NOT EXISTS approvalstatus text NOT NULL DEFAULT 'Approved';
ALTER TABLE public.kcbl_variation_payments ADD COLUMN IF NOT EXISTS approvedbyuserid text;
ALTER TABLE public.kcbl_variation_payments ADD COLUMN IF NOT EXISTS approvedat timestamptz;
ALTER TABLE public.kcbl_variation_payments ADD COLUMN IF NOT EXISTS rejectionreason text;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='kcbl_variation_payment_approval_check') THEN
 ALTER TABLE public.kcbl_variation_payments ADD CONSTRAINT kcbl_variation_payment_approval_check CHECK (approvalstatus IN ('Pending','Approved','Rejected'));
 END IF;
END $$;

-- Atomic payment submission; count pending reservations to prevent concurrent overpayments.
CREATE OR REPLACE FUNCTION public.kcbl_submit_variation_payment(
 p_variationid uuid,p_date date,p_amount numeric,p_reference text,p_notes text,p_userid text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.kcbl_variations%ROWTYPE; paid numeric; newid uuid;
BEGIN
 IF p_amount IS NULL OR p_amount<=0 OR p_amount<>round(p_amount,2) OR p_date IS NULL OR p_userid IS NULL OR btrim(p_userid)='' THEN RAISE EXCEPTION 'Invalid payment details'; END IF;
 SELECT * INTO v FROM public.kcbl_variations WHERE id=p_variationid FOR UPDATE;
 IF NOT FOUND OR v.approvalstatus<>'Approved' THEN RAISE EXCEPTION 'Variation must be approved'; END IF;
 SELECT COALESCE(SUM(amount),0) INTO paid FROM public.kcbl_variation_payments WHERE variationid=p_variationid AND approvalstatus IN ('Pending','Approved');
 IF paid+p_amount>v.amount THEN RAISE EXCEPTION 'Payment exceeds unreserved variation balance'; END IF;
 INSERT INTO public.kcbl_variation_payments(variationid,paymentdate,amount,reference,notes,createdbyuserid,approvalstatus)
 VALUES(p_variationid,p_date,p_amount,p_reference,p_notes,p_userid,'Pending') RETURNING id INTO newid;
 RETURN newid;
END $$;

CREATE OR REPLACE FUNCTION public.kcbl_decide_variation_payment(p_id uuid,p_decision text,p_reason text,p_userid text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pay public.kcbl_variation_payments%ROWTYPE;
BEGIN
 IF p_decision NOT IN ('Approved','Rejected') OR (p_decision='Rejected' AND coalesce(btrim(p_reason),'')='') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
 SELECT * INTO pay FROM public.kcbl_variation_payments WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
 IF pay.approvalstatus<>'Pending' THEN RAISE EXCEPTION 'Payment already reviewed'; END IF;
 IF pay.createdbyuserid=p_userid THEN RAISE EXCEPTION 'Maker cannot approve own payment'; END IF;
 UPDATE public.kcbl_variation_payments SET approvalstatus=p_decision,approvedbyuserid=p_userid,approvedat=now(),rejectionreason=CASE WHEN p_decision='Rejected' THEN p_reason ELSE NULL END WHERE id=p_id;
 RETURN true;
END $$;

-- Serialize company cash decisions so two outflows cannot both spend the same balance.
CREATE OR REPLACE FUNCTION public.kcbl_decide_company_entry(p_id uuid,p_decision text,p_reason text,p_userid text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE item public.kcbl_company_entries%ROWTYPE; available numeric;
BEGIN
 IF p_decision NOT IN ('Approved','Rejected') OR (p_decision='Rejected' AND coalesce(btrim(p_reason),'')='') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
 PERFORM pg_advisory_xact_lock(71433019); -- dedicated company ledger lock
 SELECT * INTO item FROM public.kcbl_company_entries WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found'; END IF;
 IF item.approvalstatus<>'Pending' THEN RAISE EXCEPTION 'Entry already reviewed'; END IF;
 IF item.createdbyuserid=p_userid THEN RAISE EXCEPTION 'Maker cannot approve own entry'; END IF;
 IF p_decision='Approved' AND item.direction='Outflow' THEN
 SELECT coalesce(sum(CASE WHEN direction='Inflow' THEN amount ELSE -amount END),0) INTO available FROM public.kcbl_company_entries WHERE approvalstatus='Approved';
 IF item.amount>available THEN RAISE EXCEPTION 'Insufficient approved company cash balance'; END IF;
 END IF;
 UPDATE public.kcbl_company_entries SET approvalstatus=p_decision,approvedbyuserid=p_userid,approvedat=now(),rejectionreason=CASE WHEN p_decision='Rejected' THEN p_reason ELSE NULL END WHERE id=p_id;
 RETURN true;
END $$;

-- Retire old direct-approved payment RPC after moving the application to submit/approve.
REVOKE ALL ON FUNCTION public.kcbl_add_variation_payment(uuid,date,numeric,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.kcbl_submit_variation_payment(uuid,date,numeric,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.kcbl_decide_variation_payment(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.kcbl_decide_company_entry(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.kcbl_submit_variation_payment(uuid,date,numeric,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.kcbl_decide_variation_payment(uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.kcbl_decide_company_entry(uuid,text,text,text) TO service_role;
COMMIT;
