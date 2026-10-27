-- Driver_Kiran was created correctly as a driver via the Drivers admin
-- screen's Create Login (that flow doesn't touch the buggy code path), but
-- a later login attempt with "Foreman" selected hit the upsert bug in
-- app/index.tsx (now fixed) and silently flipped this account's role to
-- FOREMAN. This sets it back. The internal_vehicle_drivers.user_id link
-- from Create Login was never touched by that bug, so it should still be
-- intact -- the SELECT below confirms that.

UPDATE users
SET role = 'DRIVER'
WHERE email = 'driver_kiran@islandtower.local'
RETURNING id, email, role;

-- Confirms the driver record is still linked to this account.
SELECT id, name, user_id FROM internal_vehicle_drivers
WHERE user_id = (SELECT id FROM users WHERE email = 'driver_kiran@islandtower.local');
