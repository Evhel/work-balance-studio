-- Store every shared application entity or calendar cell as its own row.
-- This keeps concurrent edits to unrelated records independent while allowing
-- Lovable to add JSON fields without an immediate database migration.

CREATE TABLE public.app_records (
  record_kind text NOT NULL CHECK (record_kind IN (
    'project',
    'contractor',
    'timesheet',
    'remote_override',
    'day_override',
    'plan',
    'personal_event',
    'effort_row',
    'effort_done',
    'filter_set',
    'access'
  )),
  record_key text NOT NULL CHECK (length(record_key) BETWEEN 1 AND 500),
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  PRIMARY KEY (record_kind, record_key),
  CHECK (
    (record_kind IN ('effort_row', 'effort_done', 'filter_set') AND owner_id IS NOT NULL)
    OR
    (record_kind NOT IN ('effort_row', 'effort_done', 'filter_set') AND owner_id IS NULL)
  )
);

CREATE INDEX app_records_owner_id_idx ON public.app_records (owner_id)
  WHERE owner_id IS NOT NULL;

REVOKE ALL ON public.app_records FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_records TO authenticated;
GRANT ALL ON public.app_records TO service_role;
ALTER TABLE public.app_records ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.can_access(_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_position text;
  current_department text;
  override_value boolean;
BEGIN
  SELECT position, department
  INTO current_position, current_department
  FROM public.profiles
  WHERE id = auth.uid();

  IF current_position IS NULL THEN
    RETURN false;
  END IF;

  -- A moderator must never be able to remove the last route back to this page.
  IF _action = 'manageRoles' THEN
    RETURN current_position = 'Модератор';
  END IF;

  SELECT (payload #>> '{}')::boolean
  INTO override_value
  FROM public.app_records
  WHERE record_kind = 'access'
    AND record_key = current_position || '|' || _action;

  IF override_value IS NOT NULL THEN
    RETURN override_value;
  END IF;

  IF _action IN (
    'viewTimesheet', 'viewContractors', 'viewEffort', 'viewDashboards'
  ) THEN
    RETURN true;
  ELSIF _action = 'editTimesheet' THEN
    RETURN current_position IN ('Офис-менеджер', 'Модератор');
  ELSIF _action IN ('editContractors', 'createProject', 'editProject', 'editDepartment') THEN
    RETURN current_position IN ('Директор', 'Модератор', 'Руководитель отдела')
      OR current_department = 'ГИП';
  ELSIF _action = 'editEffort' THEN
    RETURN current_position IN ('Директор', 'Модератор', 'Руководитель отдела');
  ELSIF _action = 'editEmployeeCard' THEN
    RETURN current_position = 'Офис-менеджер';
  ELSIF _action = 'deleteEntities' THEN
    RETURN current_position = 'Модератор';
  END IF;

  RETURN false;
END
$$;

REVOKE EXECUTE ON FUNCTION private.can_access(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_access(text) TO authenticated;

CREATE OR REPLACE FUNCTION private.touch_app_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END
$$;

REVOKE EXECUTE ON FUNCTION private.touch_app_record() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER app_records_touch
BEFORE UPDATE ON public.app_records
FOR EACH ROW EXECUTE FUNCTION private.touch_app_record();

CREATE POLICY app_records_select_authenticated ON public.app_records
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (record_kind <> 'filter_set' OR owner_id = auth.uid())
  );

CREATE POLICY app_records_insert_authorized ON public.app_records
  FOR INSERT TO authenticated
  WITH CHECK (
    CASE record_kind
      WHEN 'project' THEN private.can_access('createProject')
      WHEN 'contractor' THEN private.can_access('editContractors')
      WHEN 'timesheet' THEN private.can_access('editTimesheet')
      WHEN 'remote_override' THEN private.can_access('editTimesheet')
      WHEN 'day_override' THEN private.can_access('editTimesheet')
      WHEN 'plan' THEN private.can_access('editProject')
        OR private.can_access('editDepartment')
        OR private.can_access('editContractors')
      WHEN 'personal_event' THEN private.can_access('editDepartment')
      WHEN 'effort_row' THEN owner_id = auth.uid() OR private.can_access('editEffort')
      WHEN 'effort_done' THEN owner_id = auth.uid() OR private.can_access('editEffort')
      WHEN 'filter_set' THEN owner_id = auth.uid()
      WHEN 'access' THEN private.can_access('manageRoles')
      ELSE false
    END
  );

CREATE POLICY app_records_update_authorized ON public.app_records
  FOR UPDATE TO authenticated
  USING (
    CASE record_kind
      WHEN 'project' THEN private.can_access('editProject')
      WHEN 'contractor' THEN private.can_access('editContractors')
      WHEN 'timesheet' THEN private.can_access('editTimesheet')
      WHEN 'remote_override' THEN private.can_access('editTimesheet')
      WHEN 'day_override' THEN private.can_access('editTimesheet')
      WHEN 'plan' THEN private.can_access('editProject')
        OR private.can_access('editDepartment')
        OR private.can_access('editContractors')
      WHEN 'personal_event' THEN private.can_access('editDepartment')
      WHEN 'effort_row' THEN owner_id = auth.uid() OR private.can_access('editEffort')
      WHEN 'effort_done' THEN owner_id = auth.uid() OR private.can_access('editEffort')
      WHEN 'filter_set' THEN owner_id = auth.uid()
      WHEN 'access' THEN private.can_access('manageRoles')
      ELSE false
    END
  )
  WITH CHECK (
    CASE record_kind
      WHEN 'project' THEN private.can_access('editProject')
      WHEN 'contractor' THEN private.can_access('editContractors')
      WHEN 'timesheet' THEN private.can_access('editTimesheet')
      WHEN 'remote_override' THEN private.can_access('editTimesheet')
      WHEN 'day_override' THEN private.can_access('editTimesheet')
      WHEN 'plan' THEN private.can_access('editProject')
        OR private.can_access('editDepartment')
        OR private.can_access('editContractors')
      WHEN 'personal_event' THEN private.can_access('editDepartment')
      WHEN 'effort_row' THEN owner_id = auth.uid() OR private.can_access('editEffort')
      WHEN 'effort_done' THEN owner_id = auth.uid() OR private.can_access('editEffort')
      WHEN 'filter_set' THEN owner_id = auth.uid()
      WHEN 'access' THEN private.can_access('manageRoles')
      ELSE false
    END
  );

CREATE POLICY app_records_delete_authorized ON public.app_records
  FOR DELETE TO authenticated
  USING (
    CASE record_kind
      WHEN 'project' THEN private.can_access('deleteEntities')
      WHEN 'contractor' THEN private.can_access('deleteEntities')
      WHEN 'timesheet' THEN private.can_access('editTimesheet')
      WHEN 'remote_override' THEN private.can_access('editTimesheet')
      WHEN 'day_override' THEN private.can_access('editTimesheet')
      WHEN 'plan' THEN private.can_access('editProject')
        OR private.can_access('editDepartment')
        OR private.can_access('editContractors')
      WHEN 'personal_event' THEN private.can_access('editDepartment')
      WHEN 'effort_row' THEN owner_id = auth.uid() OR private.can_access('editEffort')
      WHEN 'effort_done' THEN owner_id = auth.uid() OR private.can_access('editEffort')
      WHEN 'filter_set' THEN owner_id = auth.uid()
      WHEN 'access' THEN private.can_access('manageRoles')
      ELSE false
    END
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.app_records;
