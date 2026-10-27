-- Adds a DRIVER login role, built on the existing Drivers/Operators list
-- (internal_vehicle_drivers) rather than a separate account list. A driver
-- logs in with the same username/password auth as a foreman, but their
-- `users` row has role = 'DRIVER' and their internal_vehicle_drivers row
-- is linked back to it via user_id -- that link is what lets the Internal
-- Vehicle Entry form auto-fill and lock their own name/company instead of
-- letting them pick anyone else's.

-- Postgres requires a new enum value to be committed before it can be used,
-- so run this statement on its own first if your SQL editor runs the whole
-- file as one transaction (Supabase's editor runs each statement
-- separately, so running the file as-is is fine there).
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'DRIVER';

ALTER TABLE internal_vehicle_drivers ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id);
