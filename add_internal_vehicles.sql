-- Run this in the Supabase SQL Editor.
-- New "Internal Vehicles" entry type -- for equipment/vehicles the company owns
-- outright, as opposed to equipment_master which is the supplier rental
-- catalogue. No supplier, no rental type, no invoice tracking -- just usage
-- logging, matching the boss's existing paper/Excel "Monthly Vehicle Time
-- sheet" columns: Date, Requester Name, Driver Name, Vehicle No, Vehicle
-- Type, Site/Project + Job Number (-> jobs picker), Section, Start, End,
-- Total Working Hours, Trip, Rate/Amount (AED), IST Timesheet Number,
-- Remarks.
--
-- Unlike the first draft of this feature, every entry logs BOTH working
-- hours AND a trip count together (the real sheet has both columns filled
-- on every single row, even for hour-based machines like excavators) --
-- there's no HOURLY-vs-TRIP exclusive mode, so there's no from/to job pair
-- either. Just one job/site per entry, same as Equipment.
--
-- `basis` mirrors Equipment's Rental Type picker (Hourly / Trip Basis) --
-- it's just a classification of how the Rate/Amount should be read, it
-- doesn't hide the Start/End/Hours or Trip fields the way Equipment's
-- rental_type does, since both are always filled on every entry here.

-- If an earlier draft of this table already exists on your database with the
-- old vehicle_name/usage_type columns, drop it first so the create below
-- gets the real shape. Safe to run even if it was never created.
DROP TABLE IF EXISTS public.internal_vehicle_entries;
DROP TABLE IF EXISTS public.internal_vehicles;

CREATE TABLE public.internal_vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_number TEXT NOT NULL,
    vehicle_type TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.internal_vehicle_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_date DATE NOT NULL,
    internal_vehicle_id UUID REFERENCES public.internal_vehicles(id),
    company TEXT NOT NULL DEFAULT 'IST',
    job_id UUID REFERENCES public.jobs(id),
    section TEXT NOT NULL,
    basis TEXT NOT NULL DEFAULT 'HOURLY',
    start_time TIME,
    end_time TIME,
    break_hours NUMERIC(4, 2) DEFAULT 0.00,
    working_hours NUMERIC(4, 2),
    number_of_trips INT NOT NULL DEFAULT 0,
    requester_name VARCHAR(255) NOT NULL,
    driver_name VARCHAR(255) NOT NULL,
    rate_amount NUMERIC(10, 2),
    ist_timesheet_number VARCHAR(100),
    internal_vehicle_photo_url TEXT NOT NULL,
    remarks TEXT,
    rejection_reason TEXT,
    no_photo_reason TEXT,
    status entry_status DEFAULT 'SUBMITTED',
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.internal_vehicles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations for authenticated users on internal_vehicles" ON public.internal_vehicles;
CREATE POLICY "Allow all operations for authenticated users on internal_vehicles"
    ON public.internal_vehicles FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.internal_vehicle_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations for authenticated users on internal_vehicle_entries" ON public.internal_vehicle_entries;
CREATE POLICY "Allow all operations for authenticated users on internal_vehicle_entries"
    ON public.internal_vehicle_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
