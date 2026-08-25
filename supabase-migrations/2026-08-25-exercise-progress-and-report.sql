-- Phrase progress, exercise-result notifications and deep links.
-- Safe to re-run on the self-hosted Supabase instance.

create table if not exists public.vocal_phrase_progress (
  student_id uuid not null references public.profiles(id) on delete cascade,
  phrase_id uuid not null references public.exercise_phrases(id) on delete cascade,
  best_score integer not null check (best_score between 0 and 100),
  best_attempt_id uuid references public.vocal_exercise_attempts(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (student_id, phrase_id)
);

create index if not exists vocal_phrase_progress_student_idx
  on public.vocal_phrase_progress (student_id, updated_at desc);

alter table public.vocal_phrase_progress enable row level security;

drop policy if exists "vocal_phrase_progress_read_own_or_admin" on public.vocal_phrase_progress;
create policy "vocal_phrase_progress_read_own_or_admin"
on public.vocal_phrase_progress for select
to authenticated
using (student_id = auth.uid() or public.current_user_is_admin());

create or replace function public.upsert_vocal_phrase_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('evaluated', 'shared') and new.overall_score is not null then
    insert into public.vocal_phrase_progress (
      student_id, phrase_id, best_score, best_attempt_id, updated_at
    )
    values (new.student_id, new.phrase_id, new.overall_score, new.id, now())
    on conflict (student_id, phrase_id) do update
      set best_score = greatest(public.vocal_phrase_progress.best_score, excluded.best_score),
          best_attempt_id = case
            when excluded.best_score > public.vocal_phrase_progress.best_score
              then excluded.best_attempt_id
            else public.vocal_phrase_progress.best_attempt_id
          end,
          updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists on_vocal_attempt_progress on public.vocal_exercise_attempts;
create trigger on_vocal_attempt_progress
after insert or update of status, overall_score on public.vocal_exercise_attempts
for each row execute procedure public.upsert_vocal_phrase_progress();

insert into public.vocal_phrase_progress (student_id, phrase_id, best_score, best_attempt_id, updated_at)
select distinct on (student_id, phrase_id)
  student_id,
  phrase_id,
  overall_score,
  id,
  coalesce(evaluated_at, created_at, now())
from public.vocal_exercise_attempts
where status in ('evaluated', 'shared')
  and overall_score is not null
order by student_id, phrase_id, overall_score desc, created_at desc
on conflict (student_id, phrase_id) do update
  set best_score = greatest(public.vocal_phrase_progress.best_score, excluded.best_score),
      best_attempt_id = case
        when excluded.best_score > public.vocal_phrase_progress.best_score
          then excluded.best_attempt_id
        else public.vocal_phrase_progress.best_attempt_id
      end,
      updated_at = now();

create or replace function public.student_exercise_progress(
  p_exercise_id uuid,
  p_student_id uuid
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    round(
      100.0 * count(*) filter (where coalesce(progress.best_score, 0) > 80)
      / nullif(count(*), 0)
    )::integer,
    0
  )
  from public.exercise_phrases as phrase
  left join public.vocal_phrase_progress as progress
    on progress.phrase_id = phrase.id
   and progress.student_id = p_student_id
  where phrase.exercise_id = p_exercise_id
    and phrase.feature_status = 'ready'
    and (
      p_student_id = auth.uid()
      or public.current_user_is_admin()
    );
$$;
revoke all on function public.student_exercise_progress(uuid, uuid) from public;
grant execute on function public.student_exercise_progress(uuid, uuid) to authenticated;

create or replace function public.chat_notification_preview(raw text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(raw, '') like '%UVS_EXERCISE_VOICE%'
      then 'Запись упражнения'
    when coalesce(raw, '') like '%UVS_EXERCISE_RESULT%'
      or coalesce(raw, '') like '%Результаты упражнения%'
      then 'Результаты упражнения'
    when coalesce(raw, '') ~ '\{"v"\s*:\s*1'
      or coalesce(raw, '') like '%"overallScore"%'
      or coalesce(raw, '') like '%Отчёт вокалиста%'
      or coalesce(raw, '') like '%Отчет вокалиста%'
      then 'Отчет от ученика'
    else left(coalesce(raw, ''), 450)
  end;
$$;

create or replace function public.notify_chat_recipient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  preview text := public.chat_notification_preview(new.message);
  is_exercise_result boolean :=
    coalesce(new.message, '') like '%UVS_EXERCISE_RESULT%'
    or coalesce(new.message, '') like '%Результаты упражнения%';
  is_exercise_voice boolean := coalesce(new.message, '') like '%UVS_EXERCISE_VOICE%';
  action text;
  notify_title text;
  notify_body text;
begin
  -- Voice follow-up after the result card should not ping the teacher again.
  if is_exercise_voice then
    return new;
  end if;

  if is_exercise_result then
    notify_title := new.sender_name || ', Результаты упражнения';
    notify_body := new.sender_name || ', Результаты упражнения';
  else
    notify_title := 'Новое сообщение';
    notify_body := new.sender_name || ': ' || preview;
  end if;

  if new.sender_id = new.student_id then
    action := '/dashboard/admin?tab=chat&student=' || new.student_id::text
      || '&message=' || new.id::text;
    insert into public.notifications (
      recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
    )
    select
      profile.id,
      'admin',
      notify_title,
      notify_body,
      'chat',
      action,
      now() + interval '5 minutes'
    from public.profiles as profile
    where profile.role = 'admin';
  else
    action := '/dashboard/student?tab=chat&message=' || new.id::text;
    insert into public.notifications (
      recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
    )
    values (
      new.student_id,
      'student',
      notify_title,
      notify_body,
      'chat',
      action,
      now() + interval '5 minutes'
    );
  end if;

  return new;
end;
$$;
