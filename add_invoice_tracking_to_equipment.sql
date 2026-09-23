-- Replaces the earlier supplier_invoices/supplier_invoice_entries design with a
-- simpler, flatter one: the invoice fields live directly on equipment_entries.
-- The foreman types the Supplier Timesheet Number when submitting (they have the
-- paper timesheet in hand then); the admin later verifies the entry and records
-- the real Invoice Number against it once the supplier's invoice arrives.
ALTER TABLE public.equipment_entries
    ADD COLUMN IF NOT EXISTS supplier_timesheet_number TEXT,
    ADD COLUMN IF NOT EXISTS invoice_status TEXT NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS invoice_number TEXT;
