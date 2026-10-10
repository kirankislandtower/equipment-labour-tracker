-- Run this in the Supabase SQL Editor.
-- New "Flushing" entry type -- tanker water supply/removal work for pipe network
-- flushing, tracked separately from general Equipment entries so it gets its own
-- approval queue and invoice tracking. The table mirrors equipment_entries
-- (same columns, same rental_type/entry_status enums, same RLS pattern); the app
-- just scopes the Equipment picker on this form to water-tanker items instead of
-- the full equipment catalogue.
CREATE TABLE IF NOT EXISTS public.flushing_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_date DATE NOT NULL,
    job_id UUID REFERENCES public.jobs(id),
    supplier_id UUID REFERENCES public.suppliers(id),
    equipment_master_id UUID REFERENCES public.equipment_master(id),
    rental_type rental_type NOT NULL,
    start_time TIME,
    end_time TIME,
    break_hours NUMERIC(4, 2) DEFAULT 0.00,
    working_hours NUMERIC(4, 2),
    number_of_trips INT DEFAULT 0,
    vehicle_number VARCHAR(100) NOT NULL,
    foreman_name VARCHAR(255) NOT NULL,
    engineer_name VARCHAR(255) NOT NULL,
    flushing_photo_url TEXT NOT NULL,
    remarks TEXT,
    rejection_reason TEXT,
    status entry_status DEFAULT 'SUBMITTED',
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    requested_by TEXT,
    assigned_job_id UUID REFERENCES public.jobs(id),
    no_photo_reason TEXT,
    fuel_provided BOOLEAN DEFAULT false,
    fuel_quantity NUMERIC(10, 2),
    fuel_unit TEXT,
    supplier_timesheet_number TEXT,
    invoice_status TEXT NOT NULL DEFAULT 'PENDING',
    invoice_number TEXT
);

ALTER TABLE public.flushing_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations for authenticated users on flushing_entries" ON public.flushing_entries;
CREATE POLICY "Allow all operations for authenticated users on flushing_entries"
    ON public.flushing_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
