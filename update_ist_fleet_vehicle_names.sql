-- Rewrites vehicle_type for the fleet added by add_ist_fleet_vehicles.sql to
-- include the full Make + Model + Body Type from the insurance sheet
-- (including the tonnage digit in Body Type, e.g. "1 Pick-up" / "3 Pick-up"
-- / "6 Ton", which the first pass had trimmed off) -- so searching by any
-- of those words (e.g. "Hilux", "Canter", "3 Pick-up") finds the vehicle.
-- Matched by Registration No (vehicle_number); safe to re-run.
UPDATE public.internal_vehicles iv
SET vehicle_type = v.vehicle_type
FROM (VALUES
  ('S/62356',  'Toyota Hilux - 1 Pick-up'),
  ('S/62868',  'Mitsubishi Canter - 3 Pick-up with Crane'),
  ('S/88024',  'Mitsubishi Canter - 3 Pick-up'),
  ('R/86455',  'Toyota Coaster - Bus'),
  ('Q/23791',  'Toyota Hilux - 1 Pick-up'),
  ('C/49039',  'Toyota Hilux - 1 Pick-up'),
  ('S/62364',  'Toyota Hilux - 1 Pick-up'),
  ('D/51032',  'Mitsubishi Canter - 3 Pick-up'),
  ('E/16894',  'Mitsubishi Canter - 3 Pick-up with Crane'),
  ('N/59185',  'Toyota Hiace - Bus'),
  ('X/74129',  'Toyota Hiace - Bus'),
  ('X/74127',  'Toyota Hilux - 1 Pick-up'),
  ('P/32539',  'Ashok Leyland Oyster - Bus'),
  ('1/85851',  'Tata - 1 Pick-up'),
  ('EE/33185', 'Nissan Sunny - Saloon'),
  ('X/88391',  'Mitsubishi Fuso - Bus'),
  ('FF/18517', 'Isuzu 6 Ton Single Cabin Chassis - 6 Ton'),
  ('FF/26752', 'Isuzu 6 Ton with Crane - 6 Ton'),
  ('G/29893',  'Maxus T60 - 1 Pick-up'),
  ('G/29454',  'Maxus T60 - 1 Pick-up'),
  ('EE/24966', 'Victory V2 - Station'),
  ('EE/27576', 'Toyota Hilux - 1 Pick-up'),
  ('FF/35447', 'Toyota Hiace - Bus'),
  ('E/84039',  'Maxus V80 - Bus'),
  ('V/41817',  'Nissan Sunny - Saloon'),
  ('V/59096',  'UD Trucks UD Kuzer 3 CBM - 6.5 Ton Truck'),
  ('N/84916',  'UD Trucks Quester CWE410 - Locomotive'),
  ('W/82185',  'Forklift'),
  ('U/69812',  'JCB Bobcat'),
  ('DD81685',  'Develon DX190WA - Wheel Excavator'),
  ('Z/15095',  'Forklift'),
  ('DD/93436', 'Hyundai HX220HD - Chain Excavator'),
  ('I/71049',  'Develon DX190WA (New) - Wheel Excavator'),
  ('U/34364',  'Develon DX190W (New) - Wheel Excavator')
) AS v(vehicle_number, vehicle_type)
WHERE iv.vehicle_number = v.vehicle_number;
