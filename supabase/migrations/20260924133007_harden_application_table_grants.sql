-- Supabase grants broad table privileges through its default privileges.
-- Keep application access explicit: RLS does not protect TRUNCATE.

REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;
REVOKE ALL ON TABLE public.user_roles FROM anon, authenticated;

GRANT SELECT, UPDATE, DELETE ON TABLE public.profiles TO authenticated;
GRANT SELECT ON TABLE public.user_roles TO authenticated;

GRANT ALL ON TABLE public.profiles TO service_role;
GRANT ALL ON TABLE public.user_roles TO service_role;
