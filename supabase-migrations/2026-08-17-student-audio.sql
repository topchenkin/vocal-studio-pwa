-- Student audio library in Supabase Storage.
-- Students: max 10 tracks, max 10 minutes each.
-- Admins: no limits.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-audio',
  'student-audio',
  false,
  52428800,
  array['audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/wav', 'audio/ogg']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.student_audio_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('remover_minus', 'remover_vocal', 'mixer')),
  title text not null check (char_length(title) between 1 and 120),
  duration_sec numeric not null check (duration_sec > 0),
  storage_path text not null unique,
  mime text not null,
  size_bytes integer not null check (size_bytes > 0),
  created_at timestamptz not null default now()
);

create index if not exists student_audio_tracks_user_created_idx
  on public.student_audio_tracks (user_id, created_at desc);

alter table public.student_audio_tracks enable row level security;

drop policy if exists "student_audio_select_own_or_admin" on public.student_audio_tracks;
create policy "student_audio_select_own_or_admin"
on public.student_audio_tracks for select
to authenticated
using (user_id = auth.uid() or public.current_user_is_admin());

drop policy if exists "student_audio_insert_own" on public.student_audio_tracks;
create policy "student_audio_insert_own"
on public.student_audio_tracks for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "student_audio_delete_own_or_admin" on public.student_audio_tracks;
create policy "student_audio_delete_own_or_admin"
on public.student_audio_tracks for delete
to authenticated
using (user_id = auth.uid() or public.current_user_is_admin());

create or replace function public.enforce_student_audio_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  track_count integer;
begin
  if public.current_user_is_admin() then
    return NEW;
  end if;

  if NEW.duration_sec > 600 then
    raise exception 'Ученикам можно сохранять трек не длиннее 10 минут';
  end if;

  select count(*)::integer
    into track_count
  from public.student_audio_tracks
  where user_id = NEW.user_id;

  if track_count >= 10 then
    raise exception 'Можно хранить 10 треков. Удалите старый в «Мои аудио»';
  end if;

  return NEW;
end;
$$;

drop trigger if exists student_audio_limits_before_insert on public.student_audio_tracks;
create trigger student_audio_limits_before_insert
before insert on public.student_audio_tracks
for each row
execute procedure public.enforce_student_audio_limits();

drop policy if exists "student_audio_admin_manage" on storage.objects;
create policy "student_audio_admin_manage"
on storage.objects for all
using (
  bucket_id = 'student-audio'
  and public.current_user_is_admin()
)
with check (
  bucket_id = 'student-audio'
  and public.current_user_is_admin()
);

drop policy if exists "student_audio_owner_insert" on storage.objects;
create policy "student_audio_owner_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'student-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "student_audio_owner_select" on storage.objects;
create policy "student_audio_owner_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'student-audio'
  and (
    public.current_user_is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

drop policy if exists "student_audio_owner_delete" on storage.objects;
create policy "student_audio_owner_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'student-audio'
  and (
    public.current_user_is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);
