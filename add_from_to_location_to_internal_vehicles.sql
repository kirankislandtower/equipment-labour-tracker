-- Adds From/To location to Internal Vehicle entries, so a trip records
-- where it started and ended (e.g. which plot, gate or storage area within
-- the job site), not just which job it belongs to.

ALTER TABLE internal_vehicle_entries ADD COLUMN from_location TEXT;
ALTER TABLE internal_vehicle_entries ADD COLUMN to_location TEXT;
