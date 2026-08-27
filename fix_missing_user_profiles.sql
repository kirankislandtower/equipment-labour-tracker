-- Reinstalls the trigger that auto-creates a public.users row whenever someone signs up
-- (this trigger exists in all_schema.sql but was never applied to the live database),
-- then backfills a profile row for any auth.users account that's missing one.
-- This is what was causing "Your account profile is not fully set up" / 409 errors on submit.
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, full_name, email, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'New User'),
    new.email,
    COALESCE((new.raw_user_meta_data->>'role')::user_role, 'FOREMAN')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Backfill: create a profile row for any existing auth account that doesn't have one yet.
INSERT INTO public.users (id, full_name, email, role)
SELECT
  au.id,
  COALESCE(au.raw_user_meta_data->>'full_name', 'New User'),
  au.email,
  COALESCE((au.raw_user_meta_data->>'role')::user_role, 'FOREMAN')
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.id = au.id);
