-- Fuel Top-Up Request workflow -- distinct from the existing Fuel Approval
-- flow (add_fuel_approval.sql), which only confirms fuel a Foreman already
-- logged against an Equipment/Flushing entry. This is the other direction:
-- a Foreman out on site asks Store to send fuel for a vehicle *before* any
-- entry exists for it. Submitting never blocks the Foreman -- it saves
-- instantly as PENDING and Store reviews it from their own queue.
--
-- Safe to re-run.
CREATE TABLE IF NOT EXISTS public.fuel_topup_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_date DATE NOT NULL,
    company TEXT,
    job_id UUID REFERENCES public.jobs(id),
    vehicle_number VARCHAR(100) NOT NULL,
    -- What the Foreman originally asked for -- kept as-is even if Store later
    -- adjusts `quantity` during approval, so there's an audit trail of the ask
    -- vs. what was actually issued.
    requested_quantity NUMERIC(10, 2) NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL,
    unit TEXT NOT NULL DEFAULT 'Liters',
    foreman_name VARCHAR(255) NOT NULL,
    remarks TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.fuel_topup_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations for authenticated users on fuel_topup_requests" ON public.fuel_topup_requests;
CREATE POLICY "Allow all operations for authenticated users on fuel_topup_requests"
    ON public.fuel_topup_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
