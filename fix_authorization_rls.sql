-- Run this in the Supabase SQL Editor.
--
-- Audit finding: every table's row-level security policy in this project is
-- "FOR ALL TO authenticated USING (true) WITH CHECK (true)" -- meaning ANY
-- logged-in account (a Foreman, a Driver, anyone) can currently read, edit,
-- approve/reject, or delete EVERY row in EVERY table, including:
--   - the `users` table itself -- a Foreman could run one API call to set
--     their own `role` to 'ADMIN' and become an admin, no exploit needed
--   - any other foreman's equipment/labour/material/flushing/vehicle
--     entries -- editing, approving, rejecting, or deleting someone else's
--     work, bypassing the entire admin review workflow
--   - Master Data (jobs, suppliers, equipment, rates) -- any foreman could
--     rename a job or change an equipment rate directly, not just admins
--   - everyone's attendance/login history
-- This was never exploited through the app's own UI (which only ever shows
-- the right buttons to the right role), but it was always reachable by
-- anyone who called the Supabase API directly with their own valid login --
-- which takes nothing more than opening browser dev tools.
--
-- This script replaces every "allow all" policy with real per-role rules:
--   - Entry tables (equipment/labour/material/flushing/internal vehicle):
--     everyone can still READ (needed for duplicate-entry checks and admin
--     reports), but you can only INSERT your own entries, and only EDIT or
--     DELETE your own -- an Admin can edit/delete any.
--   - users: you can only read/create your own row; only an Admin can
--     update (including role changes) or delete any row.
--   - Master/reference data (jobs, suppliers, equipment, drivers, vehicles,
--     allocations): everyone can still read (needed for the picker
--     dropdowns), only an Admin can create, edit, or remove.
--   - attendance_logs: you can only read your own history; an Admin can
--     read everyone's.
--   - duplicate_attempts: anyone can log a blocked attempt; only an Admin
--     can read the log.
--   - supplier_invoices / supplier_invoice_entries: Admin-only entirely --
--     no foreman-side screen touches these.
--
-- Known limitation this script does NOT close: a non-admin editing their
-- OWN entry could still, via a raw API call (not through the app's UI),
-- set its `status` to APPROVED themselves. Closing that needs a trigger
-- that compares the old and new row, not plain RLS -- worth a follow-up,
-- flagged here rather than silently left out.
--
-- Safe to re-run.

-- 1. Helper: the CURRENTLY LOGGED IN user's role, without recursing into
--    RLS on `users` itself. SECURITY DEFINER runs this one lookup as the
--    function owner, bypassing RLS just for it -- the standard safe way to
--    do a role check from inside a policy.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$;

-- 2. users -- the most important one to lock down.
DROP POLICY IF EXISTS "Allow all operations for authenticated users on users" ON public.users;
DROP POLICY IF EXISTS "users_select" ON public.users;
DROP POLICY IF EXISTS "users_insert" ON public.users;
DROP POLICY IF EXISTS "users_update" ON public.users;
DROP POLICY IF EXISTS "users_delete" ON public.users;

CREATE POLICY "users_select" ON public.users FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.current_user_role() = 'ADMIN');

CREATE POLICY "users_insert" ON public.users FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR public.current_user_role() = 'ADMIN');

CREATE POLICY "users_update" ON public.users FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'ADMIN')
  WITH CHECK (public.current_user_role() = 'ADMIN');

CREATE POLICY "users_delete" ON public.users FOR DELETE TO authenticated
  USING (public.current_user_role() = 'ADMIN');

-- 3. Entry tables that use `created_by` as their owner column.
DO $$
DECLARE
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'equipment_entries', 'labour_entries', 'flushing_entries', 'internal_vehicle_entries'
    ]
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow all operations for authenticated users on ' || tbl, tbl);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_select', tbl);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_insert', tbl);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_update', tbl);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_delete', tbl);

        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', tbl || '_select', tbl);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid())', tbl || '_insert', tbl);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.current_user_role() = ''ADMIN'') WITH CHECK (created_by = auth.uid() OR public.current_user_role() = ''ADMIN'')', tbl || '_update', tbl);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.current_user_role() = ''ADMIN'')', tbl || '_delete', tbl);
    END LOOP;
END $$;

-- material_transfers: the original schema dump (full_database_setup.sql)
-- names its owner column `user_id`, but the app's actual insert code and
-- remove_foreman1_test_data.sql both use `created_by` -- the dump is stale
-- (this repo has a history of removing outdated schema dumps). Rather than
-- guess, this detects whichever column is really there and uses that, so
-- it can't silently create a policy referencing a column that doesn't exist.
DO $$
DECLARE
    owner_col text;
BEGIN
    SELECT column_name INTO owner_col
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'material_transfers'
      AND column_name IN ('created_by', 'user_id')
    ORDER BY CASE column_name WHEN 'created_by' THEN 1 ELSE 2 END
    LIMIT 1;

    IF owner_col IS NULL THEN
        RAISE EXCEPTION 'material_transfers has neither created_by nor user_id -- check its real column name manually before setting this policy';
    END IF;

    EXECUTE 'DROP POLICY IF EXISTS "Allow all operations for authenticated users on material_transfers" ON public.material_transfers';
    EXECUTE 'DROP POLICY IF EXISTS material_transfers_select ON public.material_transfers';
    EXECUTE 'DROP POLICY IF EXISTS material_transfers_insert ON public.material_transfers';
    EXECUTE 'DROP POLICY IF EXISTS material_transfers_update ON public.material_transfers';
    EXECUTE 'DROP POLICY IF EXISTS material_transfers_delete ON public.material_transfers';

    EXECUTE 'CREATE POLICY material_transfers_select ON public.material_transfers FOR SELECT TO authenticated USING (true)';
    EXECUTE format('CREATE POLICY material_transfers_insert ON public.material_transfers FOR INSERT TO authenticated WITH CHECK (%I = auth.uid())', owner_col);
    EXECUTE format('CREATE POLICY material_transfers_update ON public.material_transfers FOR UPDATE TO authenticated USING (%I = auth.uid() OR public.current_user_role() = ''ADMIN'') WITH CHECK (%I = auth.uid() OR public.current_user_role() = ''ADMIN'')', owner_col, owner_col);
    EXECUTE 'CREATE POLICY material_transfers_delete ON public.material_transfers FOR DELETE TO authenticated USING (public.current_user_role() = ''ADMIN'')';
END $$;

-- 4. Reference / master data -- read stays open to everyone (picker
--    dropdowns, allocations), writes become Admin-only. A FOR SELECT policy
--    plus a separate Admin-only FOR ALL policy combine with OR for SELECT,
--    so reads stay open while INSERT/UPDATE/DELETE need the FOR ALL policy.
DO $$
DECLARE
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'jobs', 'suppliers', 'equipment_master', 'labour_designations',
        'internal_vehicles', 'internal_vehicle_drivers',
        'job_suppliers', 'job_equipment', 'job_supplier_employees'
    ]
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow all operations for authenticated users on ' || tbl, tbl);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_select', tbl);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_write', tbl);

        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', tbl || '_select', tbl);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.current_user_role() = ''ADMIN'') WITH CHECK (public.current_user_role() = ''ADMIN'')', tbl || '_write', tbl);
    END LOOP;
END $$;

-- 5. attendance_logs -- no reason for a foreman to read anyone else's
--    login/logout history.
DROP POLICY IF EXISTS "Allow all operations for authenticated users on attendance_logs" ON public.attendance_logs;
DROP POLICY IF EXISTS "attendance_logs_select" ON public.attendance_logs;
DROP POLICY IF EXISTS "attendance_logs_insert" ON public.attendance_logs;
DROP POLICY IF EXISTS "attendance_logs_update" ON public.attendance_logs;
DROP POLICY IF EXISTS "attendance_logs_delete" ON public.attendance_logs;

CREATE POLICY "attendance_logs_select" ON public.attendance_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.current_user_role() = 'ADMIN');
CREATE POLICY "attendance_logs_insert" ON public.attendance_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "attendance_logs_update" ON public.attendance_logs FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'ADMIN') WITH CHECK (public.current_user_role() = 'ADMIN');
CREATE POLICY "attendance_logs_delete" ON public.attendance_logs FOR DELETE TO authenticated
  USING (public.current_user_role() = 'ADMIN');

-- 6. duplicate_attempts -- only the admin Duplicate Alerts screen reads
--    this; logging a blocked attempt stays open (fire-and-forget call from
--    every entry form, no sensitive data at risk).
DROP POLICY IF EXISTS "Allow all operations for authenticated users on duplicate_attempts" ON public.duplicate_attempts;
DROP POLICY IF EXISTS "duplicate_attempts_select" ON public.duplicate_attempts;
DROP POLICY IF EXISTS "duplicate_attempts_insert" ON public.duplicate_attempts;

CREATE POLICY "duplicate_attempts_select" ON public.duplicate_attempts FOR SELECT TO authenticated
  USING (public.current_user_role() = 'ADMIN');
CREATE POLICY "duplicate_attempts_insert" ON public.duplicate_attempts FOR INSERT TO authenticated
  WITH CHECK (true);

-- 7. supplier_invoices / supplier_invoice_entries -- purely an admin
--    feature (Invoice Reconciler); no foreman-side screen touches these.
DROP POLICY IF EXISTS "Allow all operations for authenticated users on supplier_invoices" ON public.supplier_invoices;
DROP POLICY IF EXISTS "supplier_invoices_admin" ON public.supplier_invoices;
CREATE POLICY "supplier_invoices_admin" ON public.supplier_invoices FOR ALL TO authenticated
  USING (public.current_user_role() = 'ADMIN') WITH CHECK (public.current_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "Allow all operations for authenticated users on supplier_invoice_entries" ON public.supplier_invoice_entries;
DROP POLICY IF EXISTS "supplier_invoice_entries_admin" ON public.supplier_invoice_entries;
CREATE POLICY "supplier_invoice_entries_admin" ON public.supplier_invoice_entries FOR ALL TO authenticated
  USING (public.current_user_role() = 'ADMIN') WITH CHECK (public.current_user_role() = 'ADMIN');
