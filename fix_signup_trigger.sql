-- Run this in the Supabase SQL Editor. Fixes: new account signup currently fails with
-- "Database error saving new user" (a 500 from GoTrue) for every new signup attempt.
--
-- Root cause: the on_auth_user_created trigger (added by fix_missing_user_profiles.sql)
-- inserts into public.users as part of the same transaction as the auth.users insert.
-- If that insert throws for any reason (a constraint, a stale enum, RLS, etc.), Postgres
-- aborts the whole transaction, so auth.users never gets the new row either and GoTrue
-- reports a generic 500. We can't see the exact underlying error without the service-role
-- key / Postgres logs, so this version wraps the insert in an exception handler: a profile
-- insert failure now just logs a warning instead of blocking the signup. If the trigger
-- insert doesn't stick, the app's own self-heal step (app/index.tsx, upsert on first login)
-- creates the public.users row anyway, so no functionality is lost.
--
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, full_name, email, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'New User'),
    new.email,
    COALESCE((new.raw_user_meta_data->>'role')::public.user_role, 'FOREMAN')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed for auth.users id %: %', new.id, SQLERRM;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Backfill: create a profile row for any existing auth account that doesn't have one yet
-- (in case earlier failed signup attempts left an auth.users row with no matching profile).
INSERT INTO public.users (id, full_name, email, role)
SELECT
  au.id,
  COALESCE(au.raw_user_meta_data->>'full_name', 'New User'),
  au.email,
  COALESCE((au.raw_user_meta_data->>'role')::public.user_role, 'FOREMAN')
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.id = au.id);
