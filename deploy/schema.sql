-- ARV. Трудозатраты — структура базы данных
-- Снимок конечной структуры для аварийного развёртывания на чистой базе.
-- Каноническая история изменений находится в supabase/migrations.
-- На Windows обычно используйте deploy/apply-migrations.ps1: он проверяет
-- контрольные суммы и не применяет один файл дважды.
-- Выполняется один раз на новой (self-hosted) базе Supabase:
--   psql "$DATABASE_URL" -f deploy/schema.sql
-- Требуется расширение auth (схема auth создаётся установкой Supabase).

CREATE TYPE public.app_role AS ENUM ('moderator','office_manager','director','head','employee');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  last_name text NOT NULL DEFAULT '',
  first_name text NOT NULL DEFAULT '',
  middle_name text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '',
  position text NOT NULL DEFAULT 'Сотрудник',
  full_time boolean NOT NULL DEFAULT true,
  track_effort boolean NOT NULL DEFAULT true,
  start_work date,
  end_work date,
  comment text,
  hidden boolean NOT NULL DEFAULT false,
  remote_days smallint[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

REVOKE ALL ON public.user_roles FROM anon, authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION private.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.has_role(_user_id, 'moderator') OR private.has_role(_user_id, 'office_manager')
$$;

REVOKE EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO authenticated;

CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE POLICY "profiles_delete_admin" ON public.profiles
  FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));

CREATE POLICY "user_roles_select_authenticated" ON public.user_roles
  FOR SELECT TO authenticated USING (true);
