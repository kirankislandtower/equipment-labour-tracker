-- Run this in the Supabase SQL Editor to see every employee currently in
-- job_supplier_employees, along with which job and supplier they belong to.
-- Read-only, safe to run anytime.

SELECT
  j.job_number,
  j.job_name,
  s.supplier_name,
  jse.employee_name
FROM public.job_supplier_employees jse
JOIN public.jobs j ON j.id = jse.job_id
JOIN public.suppliers s ON s.id = jse.supplier_id
ORDER BY j.job_number, s.supplier_name, jse.employee_name;
