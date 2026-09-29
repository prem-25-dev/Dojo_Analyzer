begin;

do $$
declare
  role_constraint record;
  role_constraint_count integer;
begin
  select count(*)
    into role_constraint_count
  from pg_constraint as constraint_row
  join pg_class as table_row on table_row.oid = constraint_row.conrelid
  join pg_namespace as schema_row on schema_row.oid = table_row.relnamespace
  where schema_row.nspname = 'public'
    and table_row.relname = 'profiles'
    and constraint_row.contype = 'c'
    and pg_get_constraintdef(constraint_row.oid) ~* '\mrole\M'
    and pg_get_constraintdef(constraint_row.oid) ~* 'campus_manager'
    and pg_get_constraintdef(constraint_row.oid) ~* 'mentor'
    and pg_get_constraintdef(constraint_row.oid) ~* 'student'
    and pg_get_constraintdef(constraint_row.oid) !~* 'university_id|student_id';

  if role_constraint_count > 1 then
    raise exception 'Multiple standalone role checks found on public.profiles; review them before migrating';
  end if;

  for role_constraint in
    select constraint_row.conname
    from pg_constraint as constraint_row
    join pg_class as table_row on table_row.oid = constraint_row.conrelid
    join pg_namespace as schema_row on schema_row.oid = table_row.relnamespace
    where schema_row.nspname = 'public'
      and table_row.relname = 'profiles'
      and constraint_row.contype = 'c'
      and pg_get_constraintdef(constraint_row.oid) ~* '\mrole\M'
      and pg_get_constraintdef(constraint_row.oid) ~* 'campus_manager'
      and pg_get_constraintdef(constraint_row.oid) ~* 'mentor'
      and pg_get_constraintdef(constraint_row.oid) ~* 'student'
      and pg_get_constraintdef(constraint_row.oid) !~* 'university_id|student_id'
  loop
    execute format('alter table public.profiles drop constraint %I', role_constraint.conname);
  end loop;

  if not exists (
    select 1 from pg_constraint as constraint_row
    join pg_class as table_row on table_row.oid = constraint_row.conrelid
    join pg_namespace as schema_row on schema_row.oid = table_row.relnamespace
    where schema_row.nspname = 'public'
      and table_row.relname = 'profiles'
      and constraint_row.conname = 'profiles_role_allowed_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_allowed_check
      check (role in ('super_admin', 'campus_manager', 'mentor', 'student'));
  end if;
end $$;

alter table public.profiles
  drop constraint if exists profiles_super_admin_scope_check;
alter table public.profiles
  add constraint profiles_super_admin_scope_check
  check (role <> 'super_admin' or (university_id is null and student_id is null));

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);
create index if not exists audit_logs_actor_user_id_idx
  on public.audit_logs (actor_user_id);
alter table public.audit_logs enable row level security;

create table if not exists public.user_invitations (
  email text primary key,
  full_name text not null,
  role text not null check (role in ('super_admin', 'campus_manager', 'mentor', 'student')),
  university_id uuid references public.universities(id) on delete restrict,
  student_id uuid references public.students(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (
    (role = 'super_admin' and university_id is null and student_id is null) or
    (role in ('campus_manager', 'mentor') and university_id is not null and student_id is null) or
    (role = 'student' and student_id is not null)
  )
);
alter table public.user_invitations enable row level security;

commit;