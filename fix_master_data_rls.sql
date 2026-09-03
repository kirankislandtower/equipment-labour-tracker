-- Run this in the Supabase SQL Editor. Fixes: "Add New Supplier" (and Equipment /
-- Job / Designation) in Master Data does nothing when you tap Save -- no error, no
-- new row, the modal just sits there.
--
-- Root cause: suppliers, equipment_master, jobs and labour_designations have RLS
-- enabled with no working policy on the live database -- every insert/update/delete
-- silently fails with a row-level-security error (confirmed directly against the
-- live DB). job_equipment and job_suppliers hit this exact same issue earlier and
-- were already fixed in fix_allocations_rls.sql; these four tables never got the
-- same treatment.
--
-- Safe to re-run.

DROP POLICY IF EXISTS "Allow all operations for authenticated users on suppliers" ON public.suppliers;
CREATE POLICY "Allow all operations for authenticated users on suppliers"
    ON public.suppliers
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations for authenticated users on equipment_master" ON public.equipment_master;
CREATE POLICY "Allow all operations for authenticated users on equipment_master"
    ON public.equipment_master
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations for authenticated users on jobs" ON public.jobs;
CREATE POLICY "Allow all operations for authenticated users on jobs"
    ON public.jobs
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations for authenticated users on labour_designations" ON public.labour_designations;
CREATE POLICY "Allow all operations for authenticated users on labour_designations"
    ON public.labour_designations
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
