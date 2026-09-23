-- Optional cleanup: run this only after confirming the new Invoice Tracking
-- page (equipment_entries.invoice_status/invoice_number) works for you. This
-- permanently drops the earlier supplier_invoices design, including the one
-- test invoice you already created. Not run automatically -- your call.
DROP TABLE IF EXISTS public.supplier_invoice_entries;
DROP TABLE IF EXISTS public.supplier_invoices;
