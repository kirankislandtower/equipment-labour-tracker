-- Run this in the Supabase SQL Editor.
--
-- Lets an admin mark a specific (job, supplier, equipment) allocation as
-- off-hire -- the equipment has been returned to the supplier / taken off
-- rental and is no longer actually on site -- from the Allocation Report
-- screen. Off-hired equipment is hidden from the Foreman app's Equipment and
-- Flushing entry pickers for that job, and shows a badge in Site Allocations.
--
-- This is an append-only history log, not a status column on job_equipment --
-- Site Allocations' Save button deletes and reinserts ALL of a job's
-- job_equipment rows every time it's saved (see handleSave in allocations.tsx),
-- which would silently wipe out an is_off_hire column the moment anything else
-- about that job's allocation changes. Keying this table by
-- (job_id, supplier_id, equipment_master_id) instead of job_equipment.id means
-- off-hire status survives that delete/reinsert cycle, and also naturally
-- gives a full history instead of just a single current flag.
--
-- Current status for a given (job_id, supplier_id, equipment_master_id) is
-- whatever the most recent row says -- the app always reads "the latest row
-- per combo"; there's no separate current-status column to keep in sync.
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.job_equipment_offhire_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    -- NULL means the GENERAL scope (equipment not tied to a specific supplier) --
    -- matches how job_equipment.supplier_id already works.
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE CASCADE,
    equipment_master_id UUID NOT NULL REFERENCES public.equipment_master(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('OFF_HIRE', 'ON_HIRE', 'REMOVED')),
    changed_by UUID REFERENCES public.users(id),
    -- Snapshot of the admin's name at the time of the action, same pattern as
    -- foreman_name on equipment_entries -- keeps history readable even if the
    -- users row is later renamed or removed.
    changed_by_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_equipment_offhire_log_scope
    ON public.job_equipment_offhire_log (job_id, supplier_id, equipment_master_id, created_at DESC);

ALTER TABLE public.job_equipment_offhire_log ENABLE ROW LEVEL SECURITY;

-- Matches the existing permissive policy on job_equipment itself
-- (see fix_allocations_rls.sql) -- any authenticated user, same as today.
DROP POLICY IF EXISTS "Allow all operations for authenticated users on job_equipment_offhire_log" ON public.job_equipment_offhire_log;
CREATE POLICY "Allow all operations for authenticated users on job_equipment_offhire_log"
    ON public.job_equipment_offhire_log
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
