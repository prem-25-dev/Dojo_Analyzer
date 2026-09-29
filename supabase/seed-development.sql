-- DEVELOPMENT / TEST DATA ONLY
-- Safe to run repeatedly. Does not create auth users, profiles, schema, or RLS policies.

begin;

insert into public.universities (id, name)
values (
  '20363f10-78a5-4c80-bd63-273b549752c9'::uuid,
  'St. Joseph University'
)
on conflict (id) do update
set name = excluded.name;

insert into public.squads (id, university_id, squad_number)
values
  ('11111111-1111-4111-8111-111111111101'::uuid, '20363f10-78a5-4c80-bd63-273b549752c9'::uuid, '101'),
  ('11111111-1111-4111-8111-111111111102'::uuid, '20363f10-78a5-4c80-bd63-273b549752c9'::uuid, '102')
on conflict (id) do update
set university_id = excluded.university_id,
    squad_number = excluded.squad_number;

insert into public.students (id, name, email)
values
  ('22222222-2222-4222-8222-222222222201'::uuid, 'Aarav Menon', 'aarav.menon.dev@example.test'),
  ('22222222-2222-4222-8222-222222222202'::uuid, 'Maya Thompson', 'maya.thompson.dev@example.test'),
  ('22222222-2222-4222-8222-222222222203'::uuid, 'Rohan Patel', 'rohan.patel.dev@example.test'),
  ('22222222-2222-4222-8222-222222222204'::uuid, 'Sofia Martinez', 'sofia.martinez.dev@example.test')
on conflict (id) do update
set name = excluded.name,
    email = excluded.email;

insert into public.student_memberships (student_id, squad_id)
values
  ('22222222-2222-4222-8222-222222222201'::uuid, '11111111-1111-4111-8111-111111111101'::uuid),
  ('22222222-2222-4222-8222-222222222202'::uuid, '11111111-1111-4111-8111-111111111101'::uuid),
  ('22222222-2222-4222-8222-222222222203'::uuid, '11111111-1111-4111-8111-111111111102'::uuid),
  ('22222222-2222-4222-8222-222222222204'::uuid, '11111111-1111-4111-8111-111111111102'::uuid)
on conflict (student_id, squad_id) do nothing;

insert into public.weeks (
  id,
  university_id,
  academic_year,
  week_number,
  start_date,
  end_date
)
values (
  '33333333-3333-4333-8333-333333333301'::uuid,
  '20363f10-78a5-4c80-bd63-273b549752c9'::uuid,
  2026,
  1,
  '2026-01-01'::date,
  '2026-01-07'::date
)
on conflict (id) do update
set university_id = excluded.university_id,
    academic_year = excluded.academic_year,
    week_number = excluded.week_number,
    start_date = excluded.start_date,
    end_date = excluded.end_date;

insert into public.imports (
  id,
  week_id,
  file_name,
  status,
  row_count,
  is_current
)
values (
  '44444444-4444-4444-8444-444444444401'::uuid,
  '33333333-3333-4333-8333-333333333301'::uuid,
  'development-seed-week-1.csv',
  'imported',
  4,
  true
)
on conflict (id) do update
set week_id = excluded.week_id,
    file_name = excluded.file_name,
    status = excluded.status,
    row_count = excluded.row_count,
    is_current = excluded.is_current;

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
values
  (
    '22222222-2222-4222-8222-222222222201'::uuid,
    '33333333-3333-4333-8333-333333333301'::uuid,
    '44444444-4444-4444-8444-444444444401'::uuid,
    'development-seed-201',
    '2026-01-05T09:00:00Z'::timestamptz,
    '2026-01-05T10:00:00Z'::timestamptz,
    '2026-01-05T10:15:00Z'::timestamptz,
    '{"cpp": 1, "java": 0, "nodejs": 1, "python": 0}'::jsonb,
    '{"cpp": 2, "java": 1, "nodejs": 1, "python": 1}'::jsonb
  ),
  (
    '22222222-2222-4222-8222-222222222202'::uuid,
    '33333333-3333-4333-8333-333333333301'::uuid,
    '44444444-4444-4444-8444-444444444401'::uuid,
    'development-seed-202',
    '2026-01-05T10:00:00Z'::timestamptz,
    '2026-01-05T11:00:00Z'::timestamptz,
    '2026-01-05T11:15:00Z'::timestamptz,
    '{"cpp": 0, "java": 1, "nodejs": 0, "python": 1}'::jsonb,
    '{"cpp": 1, "java": 2, "nodejs": 1, "python": 2}'::jsonb
  ),
  (
    '22222222-2222-4222-8222-222222222203'::uuid,
    '33333333-3333-4333-8333-333333333301'::uuid,
    '44444444-4444-4444-8444-444444444401'::uuid,
    'development-seed-203',
    '2026-01-06T09:00:00Z'::timestamptz,
    '2026-01-06T10:00:00Z'::timestamptz,
    '2026-01-06T10:15:00Z'::timestamptz,
    '{"cpp": 1, "java": 1, "nodejs": 1, "python": 0}'::jsonb,
    '{"cpp": 2, "java": 2, "nodejs": 2, "python": 1}'::jsonb
  )
on conflict (import_id, student_id, week_id) do update
set import_id = excluded.import_id,
    source_record_id = excluded.source_record_id,
    start_time = excluded.start_time,
    calculated_end_time = excluded.calculated_end_time,
    belt_test_updated_at = excluded.belt_test_updated_at,
    initial_belt_levels = excluded.initial_belt_levels,
    final_belt_levels = excluded.final_belt_levels;

commit;
