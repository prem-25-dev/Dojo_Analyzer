begin;

create or replace function public.finalize_multiweek_import(
  p_university_id uuid,
  p_academic_year integer,
  p_students jsonb,
  p_memberships jsonb,
  p_expected_weeks jsonb,
  p_new_weeks jsonb,
  p_week_number_updates jsonb,
  p_week_batches jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  batch jsonb;
  expected_week jsonb;
  new_week jsonb;
  week_update jsonb;
  planned_student jsonb;
  current_import_id uuid;
  current_week_id uuid;
  current_week_number integer;
  current_week_date date;
  result jsonb := '[]'::jsonb;
  planned_student_ids uuid[];
begin
  if jsonb_typeof(p_students) <> 'array'
    or jsonb_typeof(p_memberships) <> 'array'
    or jsonb_typeof(p_expected_weeks) <> 'array'
    or jsonb_typeof(p_new_weeks) <> 'array'
    or jsonb_typeof(p_week_number_updates) <> 'array'
    or jsonb_typeof(p_week_batches) <> 'array'
    or jsonb_array_length(p_week_batches) = 0 then
    raise exception 'Multi-week import inputs must be JSON arrays';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_university_id::text || ':' || p_academic_year::text, 0)
  );

  for planned_student in
    select value
    from jsonb_array_elements(p_students)
    order by lower(btrim(value ->> 'email'))
  loop
    perform pg_advisory_xact_lock(
      hashtextextended('student-email:' || lower(btrim(planned_student ->> 'email')), 1)
    );
    if exists (
      select 1
      from public.students as student
      where lower(btrim(student.email)) = lower(btrim(planned_student ->> 'email'))
    ) then
      raise exception 'Student email % was created during import validation; preview the CSV again',
        planned_student ->> 'email';
    end if;
  end loop;

  if exists (
    select 1
    from public.weeks
    where university_id = p_university_id
      and academic_year = p_academic_year
      and start_date <> end_date
  ) then
    raise exception
      'Existing academic year contains legacy week date ranges; review/migrate them before importing date-derived weeks';
  end if;

  if exists (
    select start_date
    from public.weeks
    where university_id = p_university_id
      and academic_year = p_academic_year
      and start_date = end_date
    group by start_date
    having count(*) > 1
  ) then
    raise exception 'Duplicate date-derived week records exist; review week history before importing';
  end if;

  perform week.id
  from public.weeks as week
  where week.university_id = p_university_id
    and week.academic_year = p_academic_year
    and week.start_date = week.end_date
  order by week.start_date
  for update;

  for expected_week in
    select value from jsonb_array_elements(p_expected_weeks)
  loop
    if not exists (
      select 1
      from public.weeks as week
      where week.id = (expected_week ->> 'id')::uuid
        and week.university_id = p_university_id
        and week.academic_year = p_academic_year
        and week.start_date = (expected_week ->> 'date')::date
        and week.end_date = (expected_week ->> 'date')::date
        and week.week_number = (expected_week ->> 'week_number')::integer
    ) then
      raise exception 'Academic week history changed; preview the CSV again';
    end if;
  end loop;

  if (
    select count(*)
    from public.weeks as week
    where week.university_id = p_university_id
      and week.academic_year = p_academic_year
      and week.start_date = week.end_date
  ) <> jsonb_array_length(p_expected_weeks) then
    raise exception 'Academic week history changed; preview the CSV again';
  end if;

  insert into public.students (id, name, email)
  select student.id, student.name, student.email
  from jsonb_to_recordset(p_students) as student(
    id uuid,
    name text,
    email text
  );

  select coalesce(array_agg(membership.student_id order by membership.student_id), '{}')
    into planned_student_ids
  from jsonb_to_recordset(p_memberships) as membership(
    student_id uuid,
    squad_id uuid,
    start_date date
  );

  perform student.id
  from public.students as student
  where student.id = any(planned_student_ids)
  order by student.id
  for update;

  if exists (
    select 1
    from public.student_memberships as active_membership
    where active_membership.student_id = any(planned_student_ids)
      and active_membership.end_date is null
  ) then
    raise exception 'A student acquired an active squad membership during import validation';
  end if;

  for week_update in
    select value
    from jsonb_array_elements(p_week_number_updates)
    order by (value ->> 'current_week_number')::integer desc
  loop
    update public.weeks
    set week_number = (week_update ->> 'week_number')::integer
    where id = (week_update ->> 'id')::uuid
      and university_id = p_university_id
      and academic_year = p_academic_year
      and start_date = end_date
      and week_number = (week_update ->> 'current_week_number')::integer;
    if not found then
      raise exception 'Academic week numbering changed; preview the CSV again';
    end if;
  end loop;

  for new_week in
    select value
    from jsonb_array_elements(p_new_weeks)
    order by (value ->> 'week_number')::integer
  loop
    current_week_date := (new_week ->> 'date')::date;
    select id
      into current_week_id
    from public.weeks
    where university_id = p_university_id
      and academic_year = p_academic_year
      and start_date = current_week_date
      and end_date = current_week_date;

    if current_week_id is null then
      insert into public.weeks (
        id,
        university_id,
        academic_year,
        week_number,
        start_date,
        end_date
      )
      values (
        (new_week ->> 'proposed_id')::uuid,
        p_university_id,
        p_academic_year,
        (new_week ->> 'week_number')::integer,
        current_week_date,
        current_week_date
      )
      returning id into current_week_id;
    else
      select week_number
        into current_week_number
      from public.weeks
      where id = current_week_id;
      if current_week_number <> (new_week ->> 'week_number')::integer then
        raise exception 'Academic week history changed; preview the CSV again';
      end if;
    end if;
    current_week_id := null;
  end loop;

  insert into public.student_memberships (student_id, squad_id, start_date)
  select membership.student_id, membership.squad_id, membership.start_date
  from jsonb_to_recordset(p_memberships) as membership(
    student_id uuid,
    squad_id uuid,
    start_date date
  );

  for batch in select value from jsonb_array_elements(p_week_batches)
  loop
    current_week_date := (batch ->> 'date')::date;
    select id, week_number
      into current_week_id, current_week_number
    from public.weeks
    where university_id = p_university_id
      and academic_year = p_academic_year
      and start_date = current_week_date
      and end_date = current_week_date;
    if current_week_id is null then
      raise exception 'Date-derived week % was not created', current_week_date;
    end if;

    insert into public.imports (
      id,
      week_id,
      file_name,
      status,
      row_count,
      is_current,
      source_file_path
    )
    values (
      (batch ->> 'import_id')::uuid,
      current_week_id,
      batch ->> 'file_name',
      'processing',
      (batch ->> 'row_count')::integer,
      false,
      batch ->> 'source_file_path'
    )
    returning id into current_import_id;

    insert into public.raw_import_rows (
      import_id,
      row_number,
      source_record_id,
      raw_data
    )
    select
      current_import_id,
      raw_row.row_number,
      raw_row.source_record_id,
      raw_row.raw_data
    from jsonb_to_recordset(batch -> 'raw_rows') as raw_row(
      row_number integer,
      source_record_id text,
      raw_data jsonb
    );

    perform public.finalize_import(
      current_import_id,
      current_week_id,
      (batch ->> 'row_count')::integer,
      batch -> 'records'
    );

    result := result || jsonb_build_array(
      jsonb_build_object(
        'import_id', current_import_id,
        'week_id', current_week_id,
        'week_number', current_week_number,
        'academic_year', p_academic_year,
        'start_date', current_week_date,
        'end_date', current_week_date,
        'row_count', (batch ->> 'row_count')::integer
      )
    );
  end loop;

  return result;
end;
$$;

revoke all on function public.finalize_multiweek_import(
  uuid, integer, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
)
  from public, anon, authenticated;
grant execute on function public.finalize_multiweek_import(
  uuid, integer, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
)
  to service_role;

commit;