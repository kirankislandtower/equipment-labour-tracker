-- Run this in the Supabase SQL Editor. Shows every job each Labour-tagged
-- supplier is currently allocated to in Site Allocations, plus how many
-- employees are already in that supplier's roster for that job (0 means
-- the roster hasn't been filled in yet for that job/supplier combo).
-- Read-only, safe to run anytime.

SELECT
  s.supplier_name,
  j.job_number,
  j.job_name,
  COUNT(jse.id) AS employees_added
FROM public.suppliers s
JOIN public.job_suppliers js ON js.supplier_id = s.id
JOIN public.jobs j ON j.id = js.job_id
LEFT JOIN public.job_supplier_employees jse
  ON jse.job_id = js.job_id AND jse.supplier_id = js.supplier_id
WHERE s.supplier_type = 'LABOUR'
GROUP BY s.supplier_name, j.job_number, j.job_name
ORDER BY s.supplier_name, j.job_number;
