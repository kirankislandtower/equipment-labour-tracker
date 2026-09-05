-- Run this in the Supabase SQL Editor.
-- Adds a phone_number column to users, so each foreman's contact number can be
-- stored and edited from the admin "Foreman" screen's new details modal.

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number TEXT;
