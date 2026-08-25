-- Interactive vocal exercise scoring: durable jobs, phrases and temporary takes.
-- Safe to re-run on the self-hosted Supabase instance.

create table if not exists public.exercise_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null unique references public.exercises(id) on delete cascade,
  source_storage_path text not null,
  source_sha256 text,
  status text not null default 'queued'
    check (status in ('queued', 'separating', 'awaiting_phrase_review', 'extracting', 'ready', 'failed')),
  progress integer not null default 0 check (progress between 0 and 100),
  error text,
  analyzer_version text not null default 'vocal-score-1',
  vocal_storage_path text,
  duration_sec numeric,
  attempts integer not null default 0,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exercise_phrases (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  sort_order integer not null default 0,
  title text not null default '',
  start_sec numeric not null check (start_sec >= 0),
  end_sec numeric not null check (end_sec > start_sec),
  feature_status text not null default 'pending'
    check (feature_status in ('pending', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exercise_id, sort_order)
);

create table if not exists public.exercise_phrase_features (
  phrase_id uuid primary key references public.exercise_phrases(id) on delete cascade,
  analyzer_version text not null,
  features jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.vocal_exercise_attempts (
  id uuid primary key default gen_random_uuid(),
  phrase_id uuid not null references public.exercise_phrases(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text,
  media_mime text not null,
  duration_sec numeric not null check (duration_sec > 0 and duration_sec <= 45),
  status text not null default 'queued'
    check (status in ('queued', 'evaluating', 'evaluated', 'rejected', 'failed', 'shared', 'discarded')),
  overall_score integer check (overall_score between 0 and 100),
  intonation_score integer check (intonation_score between 0 and 100),
  rhythm_score integer check (rhythm_score between 0 and 100),
  completeness_score integer check (completeness_score between 0 and 100),
  global_shift_semitones integer,
  confidence jsonb not null default '{}'::jsonb,
  feedback text,
  error text,
  analyzer_version text not null default 'vocal-score-1',
  share_requested boolean not null default false,
  chat_message_id uuid references public.chat_messages(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '1 hour'),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  evaluated_at timestamptz
);

create index if not exists exercise_analysis_jobs_status_idx
  on public.exercise_analysis_jobs (status, updated_at);
create index if not exists exercise_phrases_exercise_order_idx
  on public.exercise_phrases (exercise_id, sort_order);
create index if not exists vocal_exercise_attempts_worker_idx
  on public.vocal_exercise_attempts (status, share_requested, expires_at);
create index if not exists vocal_exercise_attempts_student_idx
  on public.vocal_exercise_attempts (student_id, created_at desc);

create or replace function public.queue_exercise_analysis()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type = 'audio'
     and new.storage_path is not null
     and (tg_op = 'INSERT' or old.storage_path is distinct from new.storage_path) then
    insert into public.exercise_analysis_jobs (
      exercise_id, source_storage_path, status, progress, error, vocal_storage_path,
      source_sha256, locked_at, updated_at
    )
    values (new.id, new.storage_path, 'queued', 0, null, null, null, null, now())
    on conflict (exercise_id) do update
      set source_storage_path = excluded.source_storage_path,
          status = 'queued',
          progress = 0,
          error = null,
          vocal_storage_path = null,
          source_sha256 = null,
          locked_at = null,
          updated_at = now();
    if tg_op = 'UPDATE' then
      delete from public.exercise_phrases where exercise_id = new.id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_exercise_audio_queued on public.exercises;
create trigger on_exercise_audio_queued
after insert or update of storage_path on public.exercises
for each row execute procedure public.queue_exercise_analysis();

insert into public.exercise_analysis_jobs (exercise_id, source_storage_path, status, progress)
select id, storage_path, 'queued', 0
from public.exercises
where type = 'audio' and storage_path is not null
on conflict (exercise_id) do nothing;

create or replace function public.touch_vocal_scoring_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists touch_exercise_analysis_job on public.exercise_analysis_jobs;
create trigger touch_exercise_analysis_job before update on public.exercise_analysis_jobs
for each row execute procedure public.touch_vocal_scoring_updated_at();
drop trigger if exists touch_exercise_phrase on public.exercise_phrases;
create trigger touch_exercise_phrase before update on public.exercise_phrases
for each row execute procedure public.touch_vocal_scoring_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('exercise-analysis', 'exercise-analysis', false, 524288000,
   array['audio/wav', 'audio/x-wav', 'application/json']),
  ('vocal-attempts', 'vocal-attempts', false, 15728640,
   array['audio/wav', 'audio/x-wav', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

update storage.buckets
set file_size_limit = 524288000,
    allowed_mime_types = array[
      'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg',
      'audio/mp4', 'audio/x-m4a', 'audio/aac',
      'video/mp4', 'video/webm', 'video/quicktime'
    ]
where id = 'exercise-media';

alter table public.exercise_analysis_jobs enable row level security;
alter table public.exercise_phrases enable row level security;
alter table public.exercise_phrase_features enable row level security;
alter table public.vocal_exercise_attempts enable row level security;

drop policy if exists "analysis_jobs_admin_all" on public.exercise_analysis_jobs;
create policy "analysis_jobs_admin_all" on public.exercise_analysis_jobs for all
using (public.current_user_is_admin()) with check (public.current_user_is_admin());
drop policy if exists "analysis_jobs_ready_student_read" on public.exercise_analysis_jobs;
create policy "analysis_jobs_ready_student_read" on public.exercise_analysis_jobs for select
to authenticated using (
  status = 'ready' and public.user_can_access_exercise(exercise_id, auth.uid())
);

drop policy if exists "exercise_phrases_admin_all" on public.exercise_phrases;
create policy "exercise_phrases_admin_all" on public.exercise_phrases for all
using (public.current_user_is_admin()) with check (public.current_user_is_admin());
drop policy if exists "exercise_phrases_student_read" on public.exercise_phrases;
create policy "exercise_phrases_student_read" on public.exercise_phrases for select
to authenticated using (
  feature_status = 'ready'
  and public.user_can_access_exercise(exercise_id, auth.uid())
  and exists (
    select 1 from public.exercise_analysis_jobs j
    where j.exercise_id = exercise_phrases.exercise_id and j.status = 'ready'
  )
);

drop policy if exists "phrase_features_admin_read" on public.exercise_phrase_features;
create policy "phrase_features_admin_read" on public.exercise_phrase_features for select
using (public.current_user_is_admin());

drop policy if exists "vocal_attempts_read_own_or_admin" on public.vocal_exercise_attempts;
create policy "vocal_attempts_read_own_or_admin" on public.vocal_exercise_attempts for select
to authenticated using (student_id = auth.uid() or public.current_user_is_admin());
drop policy if exists "vocal_attempts_insert_own" on public.vocal_exercise_attempts;
create policy "vocal_attempts_insert_own" on public.vocal_exercise_attempts for insert
to authenticated with check (
  student_id = auth.uid()
  and status = 'queued'
  and storage_path like auth.uid()::text || '/%'
  and exists (
    select 1 from public.exercise_phrases p
    where p.id = phrase_id
      and p.feature_status = 'ready'
      and public.user_can_access_exercise(p.exercise_id, auth.uid())
  )
);

drop policy if exists "exercise_analysis_admin_storage" on storage.objects;
create policy "exercise_analysis_admin_storage" on storage.objects for select
to authenticated using (
  bucket_id = 'exercise-analysis' and public.current_user_is_admin()
);
drop policy if exists "vocal_attempt_owner_insert" on storage.objects;
create policy "vocal_attempt_owner_insert" on storage.objects for insert
to authenticated with check (
  bucket_id = 'vocal-attempts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.admin_retry_exercise_analysis(p_exercise_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.current_user_is_admin() then raise exception 'Admin access required'; end if;
  update public.exercise_analysis_jobs
  set status = 'queued', progress = 0, error = null, locked_at = null
  where exercise_id = p_exercise_id;
  if not found then raise exception 'Analysis job was not found'; end if;
end;
$$;
revoke all on function public.admin_retry_exercise_analysis(uuid) from public;
grant execute on function public.admin_retry_exercise_analysis(uuid) to authenticated;

create or replace function public.admin_extract_exercise_phrases(p_exercise_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.current_user_is_admin() then raise exception 'Admin access required'; end if;
  if not exists (
    select 1 from public.exercise_phrases
    where exercise_id = p_exercise_id and end_sec - start_sec between 1 and 45
  ) then raise exception 'Create at least one valid phrase'; end if;
  update public.exercise_phrases set feature_status = 'pending'
  where exercise_id = p_exercise_id;
  update public.exercise_analysis_jobs
  set status = 'extracting', progress = 72, error = null, locked_at = null
  where exercise_id = p_exercise_id
    and vocal_storage_path is not null
    and status in ('awaiting_phrase_review', 'ready', 'failed');
  if not found then raise exception 'Exercise is not ready for phrase extraction'; end if;
end;
$$;
revoke all on function public.admin_extract_exercise_phrases(uuid) from public;
grant execute on function public.admin_extract_exercise_phrases(uuid) to authenticated;

create or replace function public.request_vocal_attempt_share(p_attempt_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.vocal_exercise_attempts
  set share_requested = true, expires_at = greatest(expires_at, now() + interval '1 hour')
  where id = p_attempt_id and student_id = auth.uid() and status = 'evaluated';
  if not found then raise exception 'Evaluated attempt was not found'; end if;
end;
$$;
revoke all on function public.request_vocal_attempt_share(uuid) from public;
grant execute on function public.request_vocal_attempt_share(uuid) to authenticated;

create or replace function public.discard_vocal_attempt(p_attempt_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.vocal_exercise_attempts
  set expires_at = now()
  where id = p_attempt_id and student_id = auth.uid() and status not in ('shared', 'discarded');
end;
$$;
revoke all on function public.discard_vocal_attempt(uuid) from public;
grant execute on function public.discard_vocal_attempt(uuid) to authenticated;

-- Atomic worker claims. Only the service role can execute these functions.
create or replace function public.claim_exercise_analysis_job()
returns jsonb language plpgsql security definer set search_path = public as $$
declare claimed public.exercise_analysis_jobs%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  select * into claimed from public.exercise_analysis_jobs
  where status in ('queued', 'extracting')
    and (locked_at is null or locked_at < now() - interval '20 minutes')
  order by updated_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.exercise_analysis_jobs
  set locked_at = now(),
      status = case when claimed.status = 'queued' then 'separating' else claimed.status end,
      attempts = attempts + 1,
      progress = case when claimed.status = 'queued' then 5 else progress end
  where id = claimed.id returning * into claimed;
  return to_jsonb(claimed);
end;
$$;
revoke all on function public.claim_exercise_analysis_job() from public;
grant execute on function public.claim_exercise_analysis_job() to service_role;

create or replace function public.claim_vocal_exercise_attempt()
returns jsonb language plpgsql security definer set search_path = public as $$
declare claimed public.vocal_exercise_attempts%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  select * into claimed from public.vocal_exercise_attempts
  where (
    status = 'queued'
    or (status = 'evaluated' and share_requested and chat_message_id is null)
  )
    and (locked_at is null or locked_at < now() - interval '10 minutes')
  order by created_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.vocal_exercise_attempts
  set locked_at = now(),
      status = case when claimed.status = 'queued' then 'evaluating' else claimed.status end
  where id = claimed.id returning * into claimed;
  return to_jsonb(claimed);
end;
$$;
revoke all on function public.claim_vocal_exercise_attempt() from public;
grant execute on function public.claim_vocal_exercise_attempt() to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'exercise_analysis_jobs'
  ) then alter publication supabase_realtime add table public.exercise_analysis_jobs; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'vocal_exercise_attempts'
  ) then alter publication supabase_realtime add table public.vocal_exercise_attempts; end if;
end $$;
