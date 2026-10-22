-- Adds the same IST/JAH/HYDRO company tag used on internal_vehicle_entries
-- to Equipment, Labour, and Material Transfer entries, so each entry form's
-- new Company tab has somewhere to store the pick and the Job picker can be
-- scoped to that company's jobs. Existing rows default to IST.
-- Labour has no Hydro tab in the app, but the column still allows it for
-- schema consistency and in case that changes later.

ALTER TABLE equipment_entries ADD COLUMN company TEXT NOT NULL DEFAULT 'IST' CHECK (company IN ('IST', 'JAH', 'HYDRO'));
ALTER TABLE labour_entries ADD COLUMN company TEXT NOT NULL DEFAULT 'IST' CHECK (company IN ('IST', 'JAH', 'HYDRO'));
ALTER TABLE material_transfers ADD COLUMN company TEXT NOT NULL DEFAULT 'IST' CHECK (company IN ('IST', 'JAH', 'HYDRO'));
