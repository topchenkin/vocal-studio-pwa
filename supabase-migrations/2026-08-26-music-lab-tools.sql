-- Client-side music lab tools. Safe to re-run.

do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'ai_tool_access'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%tool_id%'
  loop
    execute format('alter table public.ai_tool_access drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.ai_tool_access
  add constraint ai_tool_access_tool_id_check
  check (tool_id in (
    'tuner', 'remover', 'timbre', 'mixer', 'pitchshift',
    'musicgen', 'songwriter', 'vocalfx', 'chordloop'
  ));

insert into public.ai_tool_access (tool_id, min_tier, enabled, title)
values
  ('vocalfx', 'none', true, 'Голосовые FX-пресеты'),
  ('chordloop', 'none', true, 'Генератор аккордовых лупов')
on conflict (tool_id) do nothing;
