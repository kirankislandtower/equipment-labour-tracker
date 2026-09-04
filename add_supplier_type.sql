-- Run this in the Supabase SQL Editor. Adds a Labour/Equipment tag to suppliers so
-- the Labour entry form's Supplier picker (and the "Assign Employees To" list in
-- Site Allocations) can show only labour suppliers (RAKSS TECHNICAL SERVICES LLC,
-- BCC, AL TAJALY, PERFECT MANPOWER SUPPLY, etc.) instead of the full mixed list that
-- also includes equipment rental companies -- and symmetrically for the Equipment
-- form / "Assign Equipment To".
--
-- supplier_type is nullable on purpose: NULL means "untagged", and untagged
-- suppliers keep showing in BOTH forms exactly like today. Nothing changes for any
-- supplier until you explicitly tag it as LABOUR or EQUIPMENT in Master Data or Site
-- Allocations -- this does not hide anything on its own.
--
-- Safe to re-run.

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS supplier_type TEXT;

ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_supplier_type_check;
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_supplier_type_check
  CHECK (supplier_type IS NULL OR supplier_type IN ('LABOUR', 'EQUIPMENT'));
