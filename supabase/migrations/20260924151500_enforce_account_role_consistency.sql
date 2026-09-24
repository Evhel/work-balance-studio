-- Keep the security role authoritative and synchronized with the displayed
-- employee position. Authenticated users must not bypass server account flows.

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_position_check
  CHECK (position IN ('Директор', 'Модератор', 'Руководитель отдела', 'Сотрудник', 'Офис-менеджер'));

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);

ALTER TABLE public.user_roles
  DROP CONSTRAINT user_roles_user_id_role_key;

CREATE OR REPLACE FUNCTION private.role_for_position(_position text)
RETURNS public.app_role
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT CASE _position
    WHEN 'Модератор' THEN 'moderator'::public.app_role
    WHEN 'Офис-менеджер' THEN 'office_manager'::public.app_role
    WHEN 'Директор' THEN 'director'::public.app_role
    WHEN 'Руководитель отдела' THEN 'head'::public.app_role
    WHEN 'Сотрудник' THEN 'employee'::public.app_role
  END
$$;

CREATE OR REPLACE FUNCTION private.sync_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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

INSERT INTO public.user_roles (user_id, role)
SELECT id, private.role_for_position(position)
FROM public.profiles
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

ALTER FUNCTION private.has_role(uuid, public.app_role) SET search_path = '';
ALTER FUNCTION private.is_admin(uuid) SET search_path = '';

DROP POLICY profiles_update_own ON public.profiles;
DROP POLICY profiles_delete_admin ON public.profiles;

REVOKE DELETE ON TABLE public.profiles FROM authenticated;
