-- Confirmed from the previous check: the login account's id is
-- 493f1833-f73f-4c55-b586-8d3d735fb8de (driver_adarsh_s@islandtower.local).
-- This links it to the driver record, matching the name loosely (ILIKE) so
-- stray spacing/casing in how it's stored can't cause another silent
-- zero-match like last time. RETURNING shows exactly what was updated.

UPDATE internal_vehicle_drivers
SET user_id = '493f1833-f73f-4c55-b586-8d3d735fb8de'
WHERE name ILIKE '%adarsh%'
RETURNING id, name, user_id;
