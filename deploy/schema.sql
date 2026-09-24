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
  position text NOT NULL DEFAULT 'Сотрудник'
    CHECK (position IN ('Директор', 'Модератор', 'Руководитель отдела', 'Сотрудник', 'Офис-менеджер')),
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
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id)
);

REVOKE ALL ON public.user_roles FROM anon, authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION private.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.has_role(_user_id, 'moderator') OR private.has_role(_user_id, 'office_manager')
$$;

REVOKE EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.role_for_position(_position text)
RETURNS public.app_role LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT CASE _position
    WHEN 'Модератор' THEN 'moderator'::public.app_role
    WHEN 'Офис-менеджер' THEN 'office_manager'::public.app_role
    WHEN 'Директор' THEN 'director'::public.app_role
    WHEN 'Руководитель отдела' THEN 'head'::public.app_role
    WHEN 'Сотрудник' THEN 'employee'::public.app_role
  END
$$;

CREATE OR REPLACE FUNCTION private.sync_profile_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, private.role_for_position(NEW.position))
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
  RETURN NEW;
END
$$;

REVOKE EXECUTE ON FUNCTION private.role_for_position(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.sync_profile_role() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER profiles_sync_role
AFTER INSERT OR UPDATE OF position ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.sync_profile_role();

CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE TO authenticated USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

CREATE POLICY "user_roles_select_authenticated" ON public.user_roles
  FOR SELECT TO authenticated USING (true);

-- Shared working data uses the canonical migration directly so the emergency
-- clean-database snapshot cannot drift from its RLS permission matrix. `\ir`
-- resolves relative to this schema file when psql runs it from the repository.
\ir ../supabase/migrations/20260924180000_add_shared_application_records.sql
