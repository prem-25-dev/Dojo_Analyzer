begin;

do $$
declare
  object_name text;
begin
  select constraint_name
    into object_name
  from (
    select
      con.conname as constraint_name,
      (
        select array_agg(attribute.attname order by key.ord)::text[]
        from unnest(con.conkey) with ordinality as key(attnum, ord)
        join pg_attribute as attribute
          on attribute.attrelid = con.conrelid
         and attribute.attnum = key.attnum
      ) as columns
    from pg_constraint as con
    join pg_class as relation
      on relation.oid = con.conrelid
    join pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'weekly_belt_records'
      and con.contype = 'u'
  ) as unique_constraints
  where columns = array['student_id', 'week_id']::text[]
  limit 1;

  if object_name is not null then
    execute format(
      'alter table public.weekly_belt_records drop constraint %I',
      object_name
    );
  else
    select index_name
      into object_name
    from (
      select
        index_relation.relname as index_name,
        (
          select array_agg(attribute.attname order by key.ord)::text[]
          from unnest(index_metadata.indkey) with ordinality as key(attnum, ord)
          join pg_attribute as attribute
            on attribute.attrelid = index_metadata.indrelid
           and attribute.attnum = key.attnum
          where key.ord <= index_metadata.indnkeyatts
        ) as columns
      from pg_index as index_metadata
      join pg_class as index_relation
        on index_relation.oid = index_metadata.indexrelid
      join pg_class as table_relation
        on table_relation.oid = index_metadata.indrelid
      join pg_namespace as namespace
        on namespace.oid = table_relation.relnamespace
      where namespace.nspname = 'public'
        and table_relation.relname = 'weekly_belt_records'
        and index_metadata.indisunique
        and not index_metadata.indisprimary
        and index_metadata.indexprs is null
        and index_metadata.indpred is null
    ) as unique_indexes
    where columns = array['student_id', 'week_id']::text[]
    limit 1;

    if object_name is not null then
      execute format('drop index public.%I', object_name);
    else
      raise exception 'No unique constraint or index found for public.weekly_belt_records(student_id, week_id)';
    end if;
  end if;

  alter table public.weekly_belt_records
    add constraint weekly_belt_records_import_student_week_key
    unique (import_id, student_id, week_id);
end $$;

commit;
