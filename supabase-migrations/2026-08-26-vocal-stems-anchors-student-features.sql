-- Instrumental/minus stems, per-phrase vocal clips, few-shot score anchors,
-- and student read access to phrase pitch features for the live tuner.
-- Safe to re-run on the self-hosted Supabase instance.

alter table public.exercise_analysis_jobs
  add column if not exists instrumental_storage_path text;

alter table public.exercise_phrases
  add column if not exists vocal_clip_storage_path text;

create table if not exists public.exercise_phrase_anchors (
  id uuid primary key default gen_random_uuid(),
  phrase_id uuid not null references public.exercise_phrases(id) on delete cascade,
  band text not null check (band in ('high', 'mid', 'low')),
  storage_path text not null,
  feature_status text not null default 'pending'
    check (feature_status in ('pending', 'extracting', 'ready', 'failed')),
  features jsonb,
  analyzer_version text,
  error text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (phrase_id, band)
);

create index if not exists exercise_phrase_anchors_worker_idx
  on public.exercise_phrase_anchors (feature_status, updated_at);

drop trigger if exists touch_exercise_phrase_anchor on public.exercise_phrase_anchors;
create trigger touch_exercise_phrase_anchor before update on public.exercise_phrase_anchors
for each row execute procedure public.touch_vocal_scoring_updated_at();

alter table public.exercise_phrase_anchors enable row level security;

drop policy if exists "phrase_anchors_admin_all" on public.exercise_phrase_anchors;
create policy "phrase_anchors_admin_all" on public.exercise_phrase_anchors for all
using (public.current_user_is_admin()) with check (public.current_user_is_admin());

-- Students must not hear or list calibration examples.
drop policy if exists "phrase_anchors_student_read" on public.exercise_phrase_anchors;

drop policy if exists "phrase_features_admin_read" on public.exercise_phrase_features;
create policy "phrase_features_admin_read" on public.exercise_phrase_features for select
using (public.current_user_is_admin());

drop policy if exists "phrase_features_student_read" on public.exercise_phrase_features;
create policy "phrase_features_student_read" on public.exercise_phrase_features for select
to authenticated using (
  exists (
    select 1 from public.exercise_phrases p
    where p.id = exercise_phrase_features.phrase_id
      and p.feature_status = 'ready'
      and public.user_can_access_exercise(p.exercise_id, auth.uid())
  )
);

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
      instrumental_storage_path, source_sha256, locked_at, updated_at
    )
    values (new.id, new.storage_path, 'queued', 0, null, null, null, null, null, now())
    on conflict (exercise_id) do update
      set source_storage_path = excluded.source_storage_path,
          status = 'queued',
          progress = 0,
          error = null,
          vocal_storage_path = null,
          instrumental_storage_path = null,
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

update storage.buckets
set allowed_mime_types = array[
  'audio/wav', 'audio/x-wav', 'application/json',
  'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/x-m4a', 'audio/aac'
]
where id = 'exercise-analysis';

drop policy if exists "exercise_analysis_admin_storage" on storage.objects;
create policy "exercise_analysis_admin_storage" on storage.objects for select
to authenticated using (
  bucket_id = 'exercise-analysis' and public.current_user_is_admin()
);
drop policy if exists "exercise_analysis_admin_insert" on storage.objects;
create policy "exercise_analysis_admin_insert" on storage.objects for insert
to authenticated with check (
  bucket_id = 'exercise-analysis' and public.current_user_is_admin()
);
drop policy if exists "exercise_analysis_admin_update" on storage.objects;
create policy "exercise_analysis_admin_update" on storage.objects for update
to authenticated using (
  bucket_id = 'exercise-analysis' and public.current_user_is_admin()
) with check (
  bucket_id = 'exercise-analysis' and public.current_user_is_admin()
);
drop policy if exists "exercise_analysis_admin_delete" on storage.objects;
create policy "exercise_analysis_admin_delete" on storage.objects for delete
to authenticated using (
  bucket_id = 'exercise-analysis' and public.current_user_is_admin()
);

create or replace function public.claim_exercise_phrase_anchor()
returns jsonb language plpgsql security definer set search_path = public as $$
declare claimed public.exercise_phrase_anchors%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  select * into claimed from public.exercise_phrase_anchors
  where feature_status = 'pending'
    and (locked_at is null or locked_at < now() - interval '10 minutes')
  order by updated_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.exercise_phrase_anchors
  set locked_at = now(), feature_status = 'extracting'
  where id = claimed.id returning * into claimed;
  return to_jsonb(claimed);
end;
$$;
revoke all on function public.claim_exercise_phrase_anchor() from public;
grant execute on function public.claim_exercise_phrase_anchor() to service_role;
