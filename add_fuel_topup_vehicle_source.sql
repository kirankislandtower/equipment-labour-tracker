-- Fuel Top-Up Requests can now be for a supplier's rented equipment, not just
-- the company's own internal vehicles. INTERNAL rows keep using vehicle_number
-- from the internal_vehicles picker; SUPPLIER rows also record which supplier
-- and which equipment (picked the same way as the Equipment entry form: job ->
-- supplier allocated to it -> equipment allocated under that supplier).
-- Safe to re-run; existing rows default to INTERNAL.
ALTER TABLE public.fuel_topup_requests
  ADD COLUMN IF NOT EXISTS vehicle_source TEXT NOT NULL DEFAULT 'INTERNAL'
    CHECK (vehicle_source IN ('INTERNAL', 'SUPPLIER'));
ALTER TABLE public.fuel_topup_requests ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id);
ALTER TABLE public.fuel_topup_requests ADD COLUMN IF NOT EXISTS equipment_master_id UUID REFERENCES public.equipment_master(id);

-- Optional photo of the vehicle/equipment (live camera preferred, gallery
-- allowed), stored as a watermarked Cloudinary URL like the other entry forms.
ALTER TABLE public.fuel_topup_requests ADD COLUMN IF NOT EXISTS photo_url TEXT;
