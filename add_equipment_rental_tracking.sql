-- Run this in the Supabase SQL Editor.
--
-- Lets an admin record "this equipment, under this supplier, on this job, is
-- rented Hourly/Daily/Weekly/Monthly and is due back by this date/time" when
-- adding it in Site Allocations. Once that due date passes, the equipment is
-- treated as overdue everywhere:
--   - hidden from the Foreman app's Equipment/Flushing pickers for that job
--     (same mechanism as the manual off-hire feature -- see
--     add_equipment_offhire_tracking.sql)
--   - shown with an "Overdue" badge in Site Allocations and Allocation Report
--   - listed on the new Rental Due admin page, across every job at once
-- The actual job_equipment row is NOT auto-deleted -- the admin removes it
-- themselves (from the Allocation Report equipment modal, or the Rental Due
-- page) once they've actually dealt with it. There's no background job here;
-- "overdue" is just computed as `now() > rental_due_at` wherever it's read.
--
-- Current rental info for a given (job_id, supplier_id, equipment_master_id)
-- is a single row, not a log -- the app deletes-then-inserts to "update" it
-- rather than relying on a DB-level upsert, because supplier_id is NULL for
-- the GENERAL scope and Postgres treats every NULL as distinct for uniqueness
-- purposes, which would silently allow duplicate GENERAL rows under a real
-- UNIQUE(job_id, supplier_id, equipment_master_id) constraint.
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.job_equipment_rental (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    -- NULL means the GENERAL scope, matching job_equipment.supplier_id itself.
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE CASCADE,
    equipment_master_id UUID NOT NULL REFERENCES public.equipment_master(id) ON DELETE CASCADE,
    rental_basis TEXT NOT NULL CHECK (rental_basis IN ('HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY')),
    rental_due_at TIMESTAMP WITH TIME ZONE NOT NULL,
    set_by UUID REFERENCES public.users(id),
    -- Snapshot of the admin's name, same pattern as job_equipment_offhire_log.changed_by_name.
    set_by_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_equipment_rental_scope
    ON public.job_equipment_rental (job_id, supplier_id, equipment_master_id);
CREATE INDEX IF NOT EXISTS idx_job_equipment_rental_due_at
    ON public.job_equipment_rental (rental_due_at);

ALTER TABLE public.job_equipment_rental ENABLE ROW LEVEL SECURITY;

-- Matches the existing permissive policy on job_equipment itself
-- (see fix_allocations_rls.sql) -- any authenticated user, same as today.
DROP POLICY IF EXISTS "Allow all operations for authenticated users on job_equipment_rental" ON public.job_equipment_rental;
CREATE POLICY "Allow all operations for authenticated users on job_equipment_rental"
    ON public.job_equipment_rental
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
