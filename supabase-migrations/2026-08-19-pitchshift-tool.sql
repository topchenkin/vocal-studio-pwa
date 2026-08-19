-- Pitch/tempo tool + library source. Safe to re-run.

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
  check (tool_id in ('tuner', 'remover', 'timbre', 'mixer', 'pitchshift'));

insert into public.ai_tool_access (tool_id, min_tier, enabled, title)
values ('pitchshift', 'standard', true, 'Изменение тональности')
on conflict (tool_id) do nothing;

do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'student_audio_tracks'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%source%'
  loop
    execute format(
      'alter table public.student_audio_tracks drop constraint %I',
      r.conname
    );
  end loop;
end $$;

alter table public.student_audio_tracks
  add constraint student_audio_tracks_source_check
  check (source in ('remover_minus', 'remover_vocal', 'mixer', 'pitchshift'));
