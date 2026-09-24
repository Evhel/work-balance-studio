-- The public timesheet value never reveals a medical absence. It stores the
-- neutral code "Н"; a separate marker is visible only to office managers.

ALTER TABLE public.app_records
  DROP CONSTRAINT app_records_record_kind_check;

ALTER TABLE public.app_records
  ADD CONSTRAINT app_records_record_kind_check CHECK (record_kind IN (
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
    'access',
    'medical_absence'
  ));

-- Preserve any records created between the shared-data migration and this
-- migration, while removing the sensitive value from the public row.
INSERT INTO public.app_records (record_kind, record_key, payload, updated_by)
SELECT 'medical_absence', record_key, 'true'::jsonb, updated_by
FROM public.app_records
WHERE record_kind = 'timesheet' AND payload = to_jsonb('Б'::text)
ON CONFLICT (record_kind, record_key) DO UPDATE SET payload = 'true'::jsonb;

UPDATE public.app_records
SET payload = to_jsonb('Н'::text)
WHERE record_kind = 'timesheet' AND payload = to_jsonb('Б'::text);

ALTER TABLE public.app_records
  ADD CONSTRAINT app_records_public_timesheet_no_medical_check
  CHECK (record_kind <> 'timesheet' OR payload <> to_jsonb('Б'::text));

DROP POLICY app_records_select_authenticated ON public.app_records;

CREATE POLICY app_records_select_authenticated ON public.app_records
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (record_kind <> 'filter_set' OR owner_id = auth.uid())
    AND (
      record_kind <> 'medical_absence'
      OR private.has_role(auth.uid(), 'office_manager')
    )
  );

CREATE POLICY app_records_medical_insert_office_manager ON public.app_records
  FOR INSERT TO authenticated
  WITH CHECK (
    record_kind = 'medical_absence'
    AND private.has_role(auth.uid(), 'office_manager')
    AND payload = 'true'::jsonb
  );

CREATE POLICY app_records_medical_update_office_manager ON public.app_records
  FOR UPDATE TO authenticated
  USING (
    record_kind = 'medical_absence'
    AND private.has_role(auth.uid(), 'office_manager')
  )
  WITH CHECK (
    record_kind = 'medical_absence'
    AND private.has_role(auth.uid(), 'office_manager')
    AND payload = 'true'::jsonb
  );

CREATE POLICY app_records_medical_delete_office_manager ON public.app_records
  FOR DELETE TO authenticated
  USING (
    record_kind = 'medical_absence'
    AND private.has_role(auth.uid(), 'office_manager')
  );

CREATE OR REPLACE FUNCTION private.clear_medical_absence_marker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.record_kind = 'timesheet' THEN
    IF TG_OP = 'DELETE' THEN
      DELETE FROM public.app_records
      WHERE record_kind = 'medical_absence' AND record_key = OLD.record_key;
    ELSIF NEW.record_kind <> 'timesheet' OR NEW.record_key <> OLD.record_key THEN
      DELETE FROM public.app_records
      WHERE record_kind = 'medical_absence' AND record_key = OLD.record_key;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.record_kind = 'timesheet' AND NEW.payload <> to_jsonb('Н'::text) THEN
      DELETE FROM public.app_records
      WHERE record_kind = 'medical_absence' AND record_key = NEW.record_key;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;

REVOKE EXECUTE ON FUNCTION private.clear_medical_absence_marker()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER app_records_clear_medical_absence
AFTER UPDATE OR DELETE ON public.app_records
FOR EACH ROW EXECUTE FUNCTION private.clear_medical_absence_marker();
