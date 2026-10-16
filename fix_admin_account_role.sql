-- Run this in the Supabase SQL Editor.
--
-- The "admin" account's role was found to be FOREMAN instead of ADMIN,
-- which is why logging into the Admin Portal was being rejected with
-- "Incorrect Portal". This sets it back to ADMIN.
--
-- Run the SELECT first to confirm you're targeting the right row, then
-- run the UPDATE, then run the SELECT again to confirm it changed.

-- 1. Check current state first
SELECT id, full_name, email, role, deleted_at
FROM public.users
WHERE email = 'admin@islandtower.local';

-- 2. Fix the role
UPDATE public.users
SET role = 'ADMIN'
WHERE email = 'admin@islandtower.local';

-- 3. Confirm it changed
SELECT id, full_name, email, role, deleted_at
FROM public.users
WHERE email = 'admin@islandtower.local';
