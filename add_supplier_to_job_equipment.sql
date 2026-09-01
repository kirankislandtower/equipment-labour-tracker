-- Run this in the Supabase SQL Editor. Adds the ability to say "this equipment,
-- allocated to this job, belongs specifically to this supplier" -- so the foreman
-- Equipment form can filter equipment by which supplier is selected, not just by job.
--
-- Existing job_equipment rows (e.g. job 1686/26's 78 items) keep supplier_id = NULL,
-- meaning "job-wide, not tied to one supplier" -- they'll keep showing regardless of
-- which supplier is picked, so nothing already configured breaks.
--
-- Also widens the uniqueness rule: the same equipment can now be allocated to the
-- same job under two different suppliers (e.g. "20 CBM TRUCK" from both BBC Trader
-- and Tauseef Cargo on the same job), which the old job_id+equipment_master_id-only
-- constraint didn't allow.
--
-- Safe to re-run.

ALTER TABLE public.job_equipment
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE CASCADE;

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.job_equipment'::regclass
    AND contype = 'u'
    AND array_length(conkey, 1) = 2;
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.job_equipment DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE public.job_equipment
  DROP CONSTRAINT IF EXISTS job_equipment_job_supplier_equipment_key;
ALTER TABLE public.job_equipment
  ADD CONSTRAINT job_equipment_job_supplier_equipment_key UNIQUE (job_id, supplier_id, equipment_master_id);
