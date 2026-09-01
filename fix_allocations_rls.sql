-- Run this in the Supabase SQL Editor. Fixes: Site Allocations "Save" always shows
-- "Allocations saved successfully!" but nothing actually persists.
--
-- Root cause: job_equipment and job_suppliers have RLS enabled with no working
-- policy on the live database (the permissive policy in setup_allocations.sql /
-- setup_supplier_allocations.sql was written but never actually applied here), so
-- every insert silently fails with a row-level-security error that the app wasn't
-- checking for -- confirmed directly against the live DB.
--
-- Safe to re-run.

DROP POLICY IF EXISTS "Allow all operations for authenticated users on job_equipment" ON public.job_equipment;
CREATE POLICY "Allow all operations for authenticated users on job_equipment"
    ON public.job_equipment
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations for authenticated users on job_suppliers" ON public.job_suppliers;
CREATE POLICY "Allow all operations for authenticated users on job_suppliers"
    ON public.job_suppliers
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
