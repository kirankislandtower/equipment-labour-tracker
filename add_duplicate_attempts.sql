-- Records each time a foreman tries to submit an entry that the duplicate check
-- blocked (same vehicle on the same date for Equipment/Material, or the same
-- employee under the same supplier on the same date for Labour), so an admin can
-- see who is doing it. Nothing happens to the foreman's account.
CREATE TABLE IF NOT EXISTS public.duplicate_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    entry_type TEXT NOT NULL,
    entry_date DATE NOT NULL,
    detail TEXT NOT NULL,
    attempted_by UUID REFERENCES public.users(id),
    foreman_name TEXT
);

ALTER TABLE public.duplicate_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations for authenticated users on duplicate_attempts" ON public.duplicate_attempts;
CREATE POLICY "Allow all operations for authenticated users on duplicate_attempts"
    ON public.duplicate_attempts FOR ALL TO authenticated USING (true) WITH CHECK (true);
