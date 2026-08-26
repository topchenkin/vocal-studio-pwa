-- Music lab v2: drop songwriter (no RU-free LLM), rename tools,
-- vocalfx library source, per-user chord loop presets. Safe to re-run.

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

delete from public.ai_tool_access where tool_id = 'songwriter';

alter table public.ai_tool_access
  add constraint ai_tool_access_tool_id_check
  check (tool_id in (
    'tuner', 'remover', 'timbre', 'mixer', 'pitchshift',
    'musicgen', 'vocalfx', 'chordloop'
  ));

insert into public.ai_tool_access (tool_id, min_tier, enabled, title)
values
  ('vocalfx', 'none', true, 'Обработка голоса'),
  ('chordloop', 'none', true, 'Генератор аккордов')
on conflict (tool_id) do update
set title = excluded.title;

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
  check (source in (
    'remover_minus', 'remover_vocal', 'mixer', 'pitchshift', 'vocalfx'
  ));

create table if not exists public.chord_loop_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  root text not null,
  mode text not null check (mode in ('major', 'minor')),
  vibe text not null,
  loop_length integer not null check (loop_length in (2, 4, 8)),
  groove text not null check (groove in ('quarters', 'arpeggio')),
  bpm integer not null check (bpm between 50 and 140),
  instrument text not null,
  created_at timestamptz not null default now()
);

create index if not exists chord_loop_presets_user_created_idx
  on public.chord_loop_presets (user_id, created_at desc);

alter table public.chord_loop_presets enable row level security;

drop policy if exists "chord_loop_presets_select_own" on public.chord_loop_presets;
create policy "chord_loop_presets_select_own"
on public.chord_loop_presets for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "chord_loop_presets_insert_own" on public.chord_loop_presets;
create policy "chord_loop_presets_insert_own"
on public.chord_loop_presets for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "chord_loop_presets_delete_own" on public.chord_loop_presets;
create policy "chord_loop_presets_delete_own"
on public.chord_loop_presets for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "chord_loop_presets_update_own" on public.chord_loop_presets;
create policy "chord_loop_presets_update_own"
on public.chord_loop_presets for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
