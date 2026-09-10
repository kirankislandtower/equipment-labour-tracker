-- Run this in the Supabase SQL Editor.
-- Lets a foreman submit Equipment/Labour/Material entries without a live photo when
-- they genuinely can't provide one (e.g. filling the form out after the work was
-- already done), as long as they pick a reason first -- the reason is recorded so
-- admins can see why, instead of the entry just silently having no photo.

ALTER TABLE equipment_entries ADD COLUMN IF NOT EXISTS no_photo_reason TEXT;
ALTER TABLE labour_entries ADD COLUMN IF NOT EXISTS no_photo_reason TEXT;
ALTER TABLE material_transfers ADD COLUMN IF NOT EXISTS no_photo_reason TEXT;
