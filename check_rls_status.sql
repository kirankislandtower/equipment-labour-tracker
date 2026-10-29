-- Read-only check, changes nothing. Run this in the Supabase SQL Editor
-- to confirm whether the public-data-exposure bug found on 2026-09-05
-- (see fix_public_data_exposure.sql) is actually patched right now.
--
-- rowsecurity = false on any row below means that table has NO row-level
-- security at all -- anyone with the app's public key could read it
-- without logging in. Every table listed should show rowsecurity = true.

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'users', 'jobs', 'suppliers', 'equipment_master', 'labour_designations',
    'job_suppliers', 'job_equipment', 'job_supplier_employees',
    'equipment_entries', 'labour_entries', 'material_transfers', 'attendance_logs',
    'internal_vehicle_entries', 'internal_vehicle_drivers', 'flushing_entries'
  )
ORDER BY tablename;

-- For any table above, this shows its actual policies and who they apply
-- to. A policy with roles = '{public}' instead of '{authenticated}' means
-- it's readable with no login -- that's the exact bug fix_public_data_exposure.sql
-- targets.
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
