-- Run this in the Supabase SQL Editor, after add_equipment_rental_tracking.sql.
--
-- Adds an optional rental start date, so the Rental Due page can show the full
-- "from this date to this date" period instead of just the due-back date.
-- Nullable -- admin can set a due date only and skip the start, same as before.
--
-- Safe to re-run.

ALTER TABLE public.job_equipment_rental
  ADD COLUMN IF NOT EXISTS rental_start_at TIMESTAMP WITH TIME ZONE;
