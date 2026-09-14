-- Soft-delete support for foreman accounts: trashing sets deleted_at instead of
-- removing the row, so it can be restored later and existing entries' created_by
-- references stay valid.
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
