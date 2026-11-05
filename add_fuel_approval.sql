-- Fuel Approval workflow -- a Foreman typing "80 Liters" on an Equipment/Flushing
-- entry was always taken as fact; there was no step where the Store side (the
-- one actually dispensing diesel) confirmed that figure before it landed in
-- reports. This adds that confirmation step without blocking the Foreman's
-- submit -- the entry saves immediately either way, fuel just sits as
-- "PENDING" until Store reviews it.
--
-- Safe to re-run. Only adds columns and backfills ones that are still NULL.

ALTER TABLE equipment_entries ADD COLUMN IF NOT EXISTS fuel_approval_status TEXT
  CHECK (fuel_approval_status IN ('PENDING', 'APPROVED', 'REJECTED'));
ALTER TABLE equipment_entries ADD COLUMN IF NOT EXISTS fuel_requested_quantity NUMERIC;
ALTER TABLE equipment_entries ADD COLUMN IF NOT EXISTS fuel_approved_by TEXT;
ALTER TABLE equipment_entries ADD COLUMN IF NOT EXISTS fuel_approved_at TIMESTAMPTZ;
ALTER TABLE equipment_entries ADD COLUMN IF NOT EXISTS fuel_rejection_reason TEXT;

ALTER TABLE flushing_entries ADD COLUMN IF NOT EXISTS fuel_approval_status TEXT
  CHECK (fuel_approval_status IN ('PENDING', 'APPROVED', 'REJECTED'));
ALTER TABLE flushing_entries ADD COLUMN IF NOT EXISTS fuel_requested_quantity NUMERIC;
ALTER TABLE flushing_entries ADD COLUMN IF NOT EXISTS fuel_approved_by TEXT;
ALTER TABLE flushing_entries ADD COLUMN IF NOT EXISTS fuel_approved_at TIMESTAMPTZ;
ALTER TABLE flushing_entries ADD COLUMN IF NOT EXISTS fuel_rejection_reason TEXT;

-- Grandfather in every entry that already had fuel on it before this feature
-- existed -- otherwise Store would suddenly see months of old entries sitting
-- in their new Pending queue on day one. Only touches rows this hasn't
-- already labelled (IS NULL), so re-running never overwrites a real decision.
UPDATE equipment_entries
  SET fuel_approval_status = 'APPROVED', fuel_requested_quantity = fuel_quantity
  WHERE fuel_provided = true AND fuel_approval_status IS NULL;

UPDATE flushing_entries
  SET fuel_approval_status = 'APPROVED', fuel_requested_quantity = fuel_quantity
  WHERE fuel_provided = true AND fuel_approval_status IS NULL;

-- Store needs to update the fuel columns on *any* foreman's entry, not just
-- its own -- the existing update policy only allows the row's own creator
-- (or an Admin) to update it. Re-create just these two tables' update
-- policies with the Store account added, rather than reopening update access
-- more broadly. The Store login is always store@islandtower.local (see
-- lib/foremanFlags.ts's isStoreForeman()).
DROP POLICY IF EXISTS "equipment_entries_update" ON public.equipment_entries;
CREATE POLICY "equipment_entries_update" ON public.equipment_entries FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.current_user_role() = 'ADMIN' OR (auth.jwt() ->> 'email') = 'store@islandtower.local')
  WITH CHECK (created_by = auth.uid() OR public.current_user_role() = 'ADMIN' OR (auth.jwt() ->> 'email') = 'store@islandtower.local');

DROP POLICY IF EXISTS "flushing_entries_update" ON public.flushing_entries;
CREATE POLICY "flushing_entries_update" ON public.flushing_entries FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.current_user_role() = 'ADMIN' OR (auth.jwt() ->> 'email') = 'store@islandtower.local')
  WITH CHECK (created_by = auth.uid() OR public.current_user_role() = 'ADMIN' OR (auth.jwt() ->> 'email') = 'store@islandtower.local');
