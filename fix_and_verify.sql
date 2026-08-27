-- One-shot: reinstalls the auto-profile trigger, backfills any missing public.users rows,
-- then lists every account so you can SEE it worked. Safe to re-run.

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

INSERT INTO public.users (id, full_name, email, role)
SELECT
  au.id,
  COALESCE(au.raw_user_meta_data->>'full_name', 'New User'),
  au.email,
  COALESCE((au.raw_user_meta_data->>'role')::user_role, 'FOREMAN')
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.id = au.id);

-- PROOF: every login account and whether it now has a profile row.
-- "profile_status" must say OK for every row, not MISSING.
SELECT
  au.email AS login_email,
  au.id AS auth_id,
  pu.full_name,
  pu.role,
  CASE WHEN pu.id IS NULL THEN 'MISSING' ELSE 'OK' END AS profile_status
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
ORDER BY au.created_at DESC;
