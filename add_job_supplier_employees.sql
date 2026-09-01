-- Run this in the Supabase SQL Editor. Adds job-scoped employee rosters per supplier.
--
-- The Labour form's Employee Name picker was previously built from a static file
-- (mock_supplier_employees.json), keyed only by supplier name -- but the same
-- supplier can have completely different employees on different jobs (e.g. RAKSS
-- TECHNICAL SERVICES LLC brings MD Habibur Rahman to job 1688/26 but MD Mozibur
-- Rahman to job 1675/25). This table lets that be modeled properly, matching the
-- job_equipment / job_suppliers pattern already in place.
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.job_supplier_employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    employee_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(job_id, supplier_id, employee_name)
);

ALTER TABLE public.job_supplier_employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations for authenticated users on job_supplier_employees" ON public.job_supplier_employees;
CREATE POLICY "Allow all operations for authenticated users on job_supplier_employees"
    ON public.job_supplier_employees
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
