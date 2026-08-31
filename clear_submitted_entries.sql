-- Run this in the Supabase SQL Editor to wipe all submitted entries before a demo/training
-- session, while keeping master data (jobs, suppliers, equipment catalogue, labour
-- designations, foreman/admin logins) fully intact.
--
-- IRREVERSIBLE. Deletes every row from equipment_entries, labour_entries, and
-- material_transfers -- including anything already approved/rejected, not just pending.
-- There is no undo. Only run this if you're certain you want a clean slate.

DELETE FROM public.equipment_entries;
DELETE FROM public.labour_entries;
DELETE FROM public.material_transfers;
