-- Run this in the Supabase SQL Editor. Tags every supplier NOT already marked
-- "Labour" as "Equipment" in one shot -- fast path instead of clicking through
-- ~46 rows individually in Master Data, since almost everything besides the
-- handful of manpower suppliers is a transport/equipment rental company.
--
-- Only touches suppliers currently untagged (supplier_type IS NULL) -- anything
-- already set to LABOUR or EQUIPMENT is left exactly as-is. Safe to re-run.
--
-- If any supplier in the list is actually neither (not equipment, not labour --
-- e.g. a pure trading/material supplier), fix it afterward in Master Data by
-- tapping "Both" on that one row; this script won't know to skip it up front.

UPDATE public.suppliers
SET supplier_type = 'EQUIPMENT'
WHERE supplier_type IS NULL;

-- PROOF: shows the new counts per type so you can confirm it worked.
SELECT supplier_type, COUNT(*) FROM public.suppliers GROUP BY supplier_type;
