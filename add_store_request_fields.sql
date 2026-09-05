-- Run this in the Supabase SQL Editor.
-- Adds "Requested By" and "Assign to Job" fields for Store-originated
-- equipment/labour entries -- lets the Store foreman record who asked for the
-- item and which real site job it's being dispatched to, separate from the
-- entry's own Job Number field.

ALTER TABLE equipment_entries ADD COLUMN IF NOT EXISTS requested_by TEXT;
ALTER TABLE equipment_entries ADD COLUMN IF NOT EXISTS assigned_job_id UUID REFERENCES jobs(id);

ALTER TABLE labour_entries ADD COLUMN IF NOT EXISTS requested_by TEXT;
ALTER TABLE labour_entries ADD COLUMN IF NOT EXISTS assigned_job_id UUID REFERENCES jobs(id);
