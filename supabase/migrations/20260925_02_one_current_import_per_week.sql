begin;

do $$
declare
  duplicate_weeks text;
begin
  select string_agg(
    format('%s (%s current imports)', week_id::text, import_count),
    ', '
    order by week_id::text
  )
    into duplicate_weeks
  from (
    select week_id, count(*) as import_count
    from public.imports
    where is_current = true
    group by week_id
    having count(*) > 1
  ) as duplicates;

  if duplicate_weeks is not null then
    raise exception
      'Cannot create imports_one_current_per_week_idx: duplicate current imports exist for week(s): %',
      duplicate_weeks;
  end if;
end $$;

create unique index if not exists imports_one_current_per_week_idx
  on public.imports (week_id)
  where is_current = true;

commit;
