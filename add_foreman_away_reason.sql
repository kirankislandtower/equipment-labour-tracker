-- Lets an admin note why a foreman is currently unavailable (e.g. "gone to
-- native place, back on 20th"). Null/empty means the foreman is presumed
-- around as normal; a non-empty value flags them as away in the admin list.
ALTER TABLE users ADD COLUMN IF NOT EXISTS away_reason TEXT;
