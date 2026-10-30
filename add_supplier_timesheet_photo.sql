-- Adds a required photo of the supplier's timesheet/DO, separate from the
-- existing mandatory vehicle/equipment photo -- so admin can visually check
-- the photo against the typed Supplier Timesheet Number, not just trust it.
--
-- Added as nullable first, backfilled on existing rows (which were approved
-- long before this feature existed and never collected this photo), then
-- made NOT NULL -- new entries from the app always provide a real value
-- going forward (a live photo, a gallery photo, or 'pending' if offline).
--
-- Safe to re-run.

ALTER TABLE equipment_entries ADD COLUMN IF NOT EXISTS supplier_timesheet_photo_url TEXT;
UPDATE equipment_entries SET supplier_timesheet_photo_url = 'NOT_REQUIRED' WHERE supplier_timesheet_photo_url IS NULL;
ALTER TABLE equipment_entries ALTER COLUMN supplier_timesheet_photo_url SET NOT NULL;

ALTER TABLE flushing_entries ADD COLUMN IF NOT EXISTS supplier_timesheet_photo_url TEXT;
UPDATE flushing_entries SET supplier_timesheet_photo_url = 'NOT_REQUIRED' WHERE supplier_timesheet_photo_url IS NULL;
ALTER TABLE flushing_entries ALTER COLUMN supplier_timesheet_photo_url SET NOT NULL;
