-- Supplier Invoices: replaces the manual monthly Excel log (supplier, invoice
-- number(s), timesheet number, and a 5-stage paperwork status), linked to the
-- exact Equipment entries each invoice covers.
CREATE TABLE IF NOT EXISTS public.supplier_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES public.suppliers(id) NOT NULL,
    -- Free text, not a single value -- the old sheet sometimes listed 2-3
    -- invoice numbers together for one period (e.g. "9892, 9877, 9890").
    invoice_numbers TEXT NOT NULL,
    timesheet_number TEXT,
    status TEXT NOT NULL DEFAULT 'TIMESHEET_RECEIVED',
    notes TEXT,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Which exact equipment_entries rows this invoice covers -- many-to-many, since
-- one invoice can span several vehicles/days, matching how the old sheet worked.
CREATE TABLE IF NOT EXISTS public.supplier_invoice_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES public.supplier_invoices(id) ON DELETE CASCADE NOT NULL,
    equipment_entry_id UUID REFERENCES public.equipment_entries(id) ON DELETE CASCADE NOT NULL,
    UNIQUE(invoice_id, equipment_entry_id)
);

ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_invoice_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations for authenticated users on supplier_invoices" ON public.supplier_invoices;
CREATE POLICY "Allow all operations for authenticated users on supplier_invoices"
    ON public.supplier_invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations for authenticated users on supplier_invoice_entries" ON public.supplier_invoice_entries;
CREATE POLICY "Allow all operations for authenticated users on supplier_invoice_entries"
    ON public.supplier_invoice_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
