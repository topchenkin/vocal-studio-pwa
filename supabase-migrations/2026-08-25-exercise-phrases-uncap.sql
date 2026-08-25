-- Persist any number of phrases, drop the 45s hard cap, and let students
-- see every saved phrase (practice still requires ready features).

alter table public.exercise_phrases
  drop constraint if exists exercise_phrases_exercise_id_sort_order_key;

create index if not exists exercise_phrases_exercise_order_idx
  on public.exercise_phrases (exercise_id, sort_order);

alter table public.vocal_exercise_attempts
  drop constraint if exists vocal_exercise_attempts_duration_sec_check;

alter table public.vocal_exercise_attempts
  add constraint vocal_exercise_attempts_duration_sec_check
  check (duration_sec > 0 and duration_sec <= 600);

drop policy if exists "exercise_phrases_student_read" on public.exercise_phrases;
create policy "exercise_phrases_student_read" on public.exercise_phrases for select
to authenticated using (
  public.user_can_access_exercise(exercise_id, auth.uid())
);

create or replace function public.admin_extract_exercise_phrases(p_exercise_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.current_user_is_admin() then raise exception 'Admin access required'; end if;
  if not exists (
    select 1 from public.exercise_phrases
    where exercise_id = p_exercise_id and end_sec - start_sec >= 1
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

update storage.buckets
set file_size_limit = 104857600,
    allowed_mime_types = array[
      'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/mp4',
      'audio/mpeg', 'audio/ogg', 'audio/x-m4a', 'audio/aac'
    ]
where id = 'vocal-attempts';
