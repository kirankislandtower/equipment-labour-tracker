-- Splits Master Data (Jobs, Suppliers, Equipment, Roles, Internal Vehicles,
-- Drivers/Operators) into separate lists per company: Island Tower (IST),
-- Jasirat (JAH), and Hydro (HYDRO). Existing rows are tagged IST so nothing
-- currently in use moves; JAH and HYDRO start as empty lists for the admin
-- to populate via the Master Data screen's company switch.

ALTER TABLE jobs ADD COLUMN company TEXT NOT NULL DEFAULT 'IST' CHECK (company IN ('IST', 'JAH', 'HYDRO'));
ALTER TABLE suppliers ADD COLUMN company TEXT NOT NULL DEFAULT 'IST' CHECK (company IN ('IST', 'JAH', 'HYDRO'));
ALTER TABLE equipment_master ADD COLUMN company TEXT NOT NULL DEFAULT 'IST' CHECK (company IN ('IST', 'JAH', 'HYDRO'));
ALTER TABLE labour_designations ADD COLUMN company TEXT NOT NULL DEFAULT 'IST' CHECK (company IN ('IST', 'JAH', 'HYDRO'));
ALTER TABLE internal_vehicles ADD COLUMN company TEXT NOT NULL DEFAULT 'IST' CHECK (company IN ('IST', 'JAH', 'HYDRO'));
ALTER TABLE internal_vehicle_drivers ADD COLUMN company TEXT NOT NULL DEFAULT 'IST' CHECK (company IN ('IST', 'JAH', 'HYDRO'));
