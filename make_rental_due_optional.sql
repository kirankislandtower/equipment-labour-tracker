-- Run this in the Supabase SQL Editor, after the other job_equipment_rental
-- migrations.
--
-- Lets an admin record just the rental basis (Daily/Weekly/Monthly/Hourly)
-- without a due date at all -- e.g. "we know it's a daily rental, we just
-- don't have an exact return date yet." Previously rental_due_at was required.
--
-- Safe to re-run.

ALTER TABLE public.job_equipment_rental
  ALTER COLUMN rental_due_at DROP NOT NULL;
