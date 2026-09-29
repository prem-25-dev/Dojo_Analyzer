begin;

create or replace function public.finalize_import(
  p_import_id uuid,
  p_week_id uuid,
  p_row_count integer,
  p_records jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  locked_week_id uuid;
  import_status text;
  import_is_current boolean;
  updated_import_count integer;
begin
  if p_row_count < 0 then
    raise exception 'Import row count cannot be negative';
  end if;

  if jsonb_typeof(p_records) <> 'array' then
    raise exception 'Validated import records must be a JSON array';
  end if;

  select id
    into locked_week_id
  from public.weeks
  where id = p_week_id
  for update;

  if locked_week_id is null then
    raise exception 'Week % does not exist', p_week_id;
  end if;

  select status, is_current
    into import_status, import_is_current
  from public.imports
  where id = p_import_id
    and week_id = p_week_id
  for update;

  if not found then
    raise exception 'Import % does not belong to week %', p_import_id, p_week_id;
  end if;

  if import_status <> 'processing' or import_is_current then
    raise exception
      'Import % is not eligible for finalization (status=%, is_current=%)',
      p_import_id,
      import_status,
      import_is_current;
  end if;

  insert into public.weekly_belt_records (
    student_id,
    week_id,
    import_id,
    source_record_id,
    start_time,
    calculated_end_time,
    belt_test_updated_at,
    initial_belt_levels,
    final_belt_levels
  )
  select
    record.student_id,
    p_week_id,
    p_import_id,
    record.source_record_id,
    record.start_time,
    record.calculated_end_time,
    record.belt_test_updated_at,
    record.initial_belt_levels,
    record.final_belt_levels
  from jsonb_to_recordset(p_records) as record(
    student_id uuid,
    source_record_id text,
    start_time timestamptz,
    calculated_end_time timestamptz,
    belt_test_updated_at timestamptz,
    initial_belt_levels jsonb,
    final_belt_levels jsonb
  )
  on conflict (import_id, student_id, week_id)
  do update set
    source_record_id = excluded.source_record_id,
    start_time = excluded.start_time,
    calculated_end_time = excluded.calculated_end_time,
    belt_test_updated_at = excluded.belt_test_updated_at,
    initial_belt_levels = excluded.initial_belt_levels,
    final_belt_levels = excluded.final_belt_levels;

  update public.imports
  set is_current = false
  where week_id = p_week_id
    and is_current = true
    and id <> p_import_id;

  update public.imports
  set status = 'imported',
      is_current = true,
      row_count = p_row_count
  where id = p_import_id
    and week_id = p_week_id;

  get diagnostics updated_import_count = row_count;
  if updated_import_count <> 1 then
    raise exception 'Import % could not be promoted to current', p_import_id;
  end if;
end;
$$;

commit;
