-- Run this in the Supabase SQL Editor.
--
-- Found while auditing the project: jobs, suppliers, equipment_master,
-- labour_designations, job_suppliers, job_equipment, and users can currently be
-- read by ANYONE on the internet with no login at all -- confirmed by querying
-- them directly with just the public anon key (the same key that ships inside
-- the app bundle, so anyone can extract it from the deployed site's network
-- traffic). That means every foreman/admin's name and email, every client job
-- name and location, every supplier name, and which suppliers/equipment are
-- allocated to which job are all publicly readable right now, unauthenticated.
--
-- Root cause: at least one of these tables has a leftover policy (or RLS was
-- never enabled at all) that doesn't restrict access to "TO authenticated" --
-- so it falls back to PostgreSQL's default of PUBLIC (literally anyone,
-- logged in or not). fix_master_data_rls.sql only dropped the one specific
-- policy name it knew about; if a different, more permissive policy already
-- existed under a different name, that fix left it in place.
--
-- This script is more thorough: for each table, it enables RLS, drops EVERY
-- existing policy regardless of name (so nothing permissive survives), and
-- recreates a single "TO authenticated" policy matching the rest of the app.
-- Anyone still logged in as a foreman/admin keeps working exactly as before --
-- this only removes access for requests with no login at all.
--
-- Safe to re-run.

DO $$
DECLARE
    tbl text;
    pol record;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'users', 'jobs', 'suppliers', 'equipment_master', 'labour_designations',
        'job_suppliers', 'job_equipment', 'job_supplier_employees',
        'equipment_entries', 'labour_entries', 'material_transfers', 'attendance_logs'
    ]
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

        FOR pol IN
            SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = tbl
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
        END LOOP;

        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
            'Allow all operations for authenticated users on ' || tbl,
            tbl
        );
    END LOOP;
END $$;
