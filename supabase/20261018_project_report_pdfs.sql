BEGIN;
CREATE TABLE IF NOT EXISTS public.projectreportpdfs (
  pdfid BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reportid BIGINT NOT NULL REFERENCES public.projectreports(reportid) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  storagepath TEXT NOT NULL UNIQUE,
  filesize BIGINT NOT NULL CHECK (filesize BETWEEN 1 AND 104857600),
  mimetype VARCHAR(100) NOT NULL DEFAULT 'application/pdf' CHECK (mimetype = 'application/pdf'),
  uploadedat TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_projectreportpdfs_reportid ON public.projectreportpdfs(reportid);
ALTER TABLE public.projectreportpdfs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.kcbl_enforce_report_pdf_limit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  count_now INTEGER;
  status_now TEXT;
BEGIN
  SELECT reviewstatus INTO status_now FROM public.projectreports
  WHERE reportid = NEW.reportid FOR UPDATE;
  IF NOT FOUND OR status_now <> 'Submitted' THEN
    RAISE EXCEPTION 'Supporting PDFs can be added only while report awaits review';
  END IF;
  SELECT count(*) INTO count_now FROM public.projectreportpdfs WHERE reportid = NEW.reportid;
  IF count_now >= 7 THEN
    RAISE EXCEPTION 'Maximum 8 PDFs per report (1 primary + 7 supporting)';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_kcbl_projectreportpdf_limit ON public.projectreportpdfs;
CREATE TRIGGER trg_kcbl_projectreportpdf_limit BEFORE INSERT ON public.projectreportpdfs
FOR EACH ROW EXECUTE FUNCTION public.kcbl_enforce_report_pdf_limit();
REVOKE ALL ON FUNCTION public.kcbl_enforce_report_pdf_limit() FROM PUBLIC;
COMMIT;
