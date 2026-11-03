-- The Equipment and Flushing entry forms already have a Location picker --
-- it shows up whenever a Job has more than one site listed (jobs.location
-- is a comma-separated list, e.g. "Plot 1, Plot 2"), letting the foreman
-- say which specific site the work was at. But the form never actually
-- saved that choice: equipment_entries and flushing_entries have no
-- location column at all, so whatever the foreman picked was silently
-- discarded on submit. This adds the missing column on both tables.
--
-- Optional (most jobs only have one site, so most entries will leave it
-- blank) -- safe to re-run.

ALTER TABLE equipment_entries ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE flushing_entries ADD COLUMN IF NOT EXISTS location TEXT;
