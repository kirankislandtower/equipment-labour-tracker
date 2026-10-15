-- Run this in the Supabase SQL Editor.
-- Adds an admin-managed "Drivers / Operators" master list for Internal
-- Vehicles, and switches the entry's Driver Name from free text (foreman
-- typing a name) to a picker referencing this list -- same pattern as the
-- Vehicle No picker, so the foreman always picks from a known roster.
--
-- NOTE: this DROPS the existing internal_vehicle_entries.driver_name text
-- column. If you already have real entries submitted, their driver name
-- text will be lost from the database (though still visible in any CSV
-- you've already exported). Add the same names to the new Drivers /
-- Operators master list in Settings first if you want new entries for the
-- same people to line up with old ones.

CREATE TABLE IF NOT EXISTS public.internal_vehicle_drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.internal_vehicle_drivers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations for authenticated users on internal_vehicle_drivers" ON public.internal_vehicle_drivers;
CREATE POLICY "Allow all operations for authenticated users on internal_vehicle_drivers"
    ON public.internal_vehicle_drivers FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.internal_vehicle_entries ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES public.internal_vehicle_drivers(id);
ALTER TABLE public.internal_vehicle_entries DROP COLUMN IF EXISTS driver_name;
