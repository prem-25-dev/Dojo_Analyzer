begin;

alter table public.imports
  add column if not exists source_file_path text;

insert into storage.buckets (id, name, public)
values ('dojo-imports', 'dojo-imports', false)
on conflict (id) do update
set public = false;

commit;