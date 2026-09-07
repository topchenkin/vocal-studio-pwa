-- Student cabinet weekly goals, practice seconds, and extra cat XP kinds.
-- Safe to re-run. Levels stay slow: new awards are 1 XP with daily caps.
-- Daily activity cap (excludes lesson + pro_test) is 12 XP.

create or replace function public.cat_studio_week_start(p_day date default null)
returns date
language sql
stable
as $$
  select (
    coalesce(p_day, public.cat_studio_today())
    - ((extract(isodow from coalesce(p_day, public.cat_studio_today()))::int) - 1)
  )::date;
$$;

alter table public.cat_xp_events
  drop constraint if exists cat_xp_events_kind_check;
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.cat_xp_events'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%kind%'
    and conname <> 'cat_xp_events_kind_check';
  if cname is not null then
    execute format('alter table public.cat_xp_events drop constraint %I', cname);
  end if;
end $$;
alter table public.cat_xp_events
  add constraint cat_xp_events_kind_check
  check (kind in (
    'checkin',
    'analyzer',
    'exercise_share',
    'exercise',
    'mixer',
    'chat',
    'practice',
    'pro_test',
    'streak',
    'lesson'
  ));

create table if not exists public.practice_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('analyzer', 'mixer', 'exercise')),
  seconds integer not null check (seconds > 0 and seconds <= 120),
  day date not null default public.cat_studio_today(),
  created_at timestamptz not null default now()
);

create index if not exists practice_log_user_day_idx
  on public.practice_log (user_id, day);
create index if not exists practice_log_user_created_idx
  on public.practice_log (user_id, created_at desc);

alter table public.practice_log enable row level security;

drop policy if exists "practice_log_read_own_or_admin" on public.practice_log;
create policy "practice_log_read_own_or_admin"
on public.practice_log for select
to authenticated
using (user_id = auth.uid() or public.current_user_is_admin());

revoke insert, update, delete on public.practice_log from public, anon, authenticated;

create or replace function public.cat_today_activity_xp(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0)::int
  from public.cat_xp_events
  where user_id = p_user_id
    and kind in (
      'checkin',
      'analyzer',
      'exercise_share',
      'exercise',
      'mixer',
      'chat',
      'practice',
      'streak'
    )
    and created_at >= timezone('Asia/Yekaterinburg', public.cat_studio_today()::timestamp)
    and created_at < timezone('Asia/Yekaterinburg', (public.cat_studio_today() + 1)::timestamp);
$$;

create or replace function public.cat_xp_daily_remaining(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(0, 12 - public.cat_today_activity_xp(p_user_id));
$$;

revoke all on function public.cat_studio_week_start(date) from public, anon, authenticated;
revoke all on function public.cat_today_activity_xp(uuid) from public, anon, authenticated;
revoke all on function public.cat_xp_daily_remaining(uuid) from public, anon, authenticated;

create or replace function public.log_practice_seconds(
  p_kind text,
  p_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := public.cat_studio_today();
  kind text := lower(trim(p_kind));
  add_sec integer;
  already integer;
  daily_cap integer := 2700;
begin
  if public.current_user_is_admin() then
    return jsonb_build_object('logged', 0, 'admin', true);
  end if;
  if auth.uid() is null then
    raise exception 'Student profile required';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'student'
  ) then
    raise exception 'Student profile required';
  end if;
  if kind not in ('analyzer', 'mixer', 'exercise') then
    raise exception 'Unknown practice kind';
  end if;

  add_sec := least(greatest(coalesce(p_seconds, 0), 0), 60);
  if add_sec < 1 then
    return jsonb_build_object('logged', 0);
  end if;

  select coalesce(sum(seconds), 0) into already
  from public.practice_log
  where user_id = auth.uid() and day = today;

  if already >= daily_cap then
    return jsonb_build_object('logged', 0, 'capped', true, 'today_sec', already);
  end if;
  add_sec := least(add_sec, daily_cap - already);

  insert into public.practice_log (user_id, kind, seconds, day)
  values (auth.uid(), kind, add_sec, today);

  return jsonb_build_object(
    'logged', add_sec,
    'today_sec', already + add_sec
  );
end;
$$;

revoke all on function public.log_practice_seconds(text, integer) from public, anon;
grant execute on function public.log_practice_seconds(text, integer) to authenticated;

create or replace function public.student_cabinet_progress()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today date := public.cat_studio_today();
  week_start date := public.cat_studio_week_start(today);
  week_from timestamptz := timezone('Asia/Yekaterinburg', week_start::timestamp);
  week_to timestamptz := timezone('Asia/Yekaterinburg', (week_start + 7)::timestamp);
  profile public.profiles%rowtype;
  cabinet_days integer := 0;
  lessons_week integer := 0;
  lessons_total integer := 0;
  exercises_week integer := 0;
  exercises_total integer := 0;
  practice_sec_week integer := 0;
  practice_sec_total integer := 0;
  analyzer_sec_week integer := 0;
  mixer_sec_week integer := 0;
  connect_week integer := 0;
  next_lesson jsonb := null;
begin
  if public.current_user_is_admin() then
    return jsonb_build_object('admin', true);
  end if;

  select * into profile from public.profiles where id = auth.uid();
  if not found or profile.role <> 'student' then
    raise exception 'Student profile required';
  end if;

  select count(*) into cabinet_days
  from public.cat_xp_events
  where user_id = auth.uid()
    and kind = 'checkin'
    and created_at >= week_from
    and created_at < week_to;

  select count(*) into lessons_week
  from public.lessons
  where student_id = auth.uid()
    and status in ('scheduled', 'completed')
    and datetime >= week_from
    and datetime < week_to
    and datetime + interval '1 hour' <= now();

  select count(*) into lessons_total
  from public.lessons
  where student_id = auth.uid()
    and status in ('scheduled', 'completed')
    and datetime + interval '1 hour' <= now();

  select count(*) into exercises_week
  from public.vocal_exercise_attempts
  where student_id = auth.uid()
    and status in ('evaluated', 'shared')
    and coalesce(evaluated_at, created_at) >= week_from
    and coalesce(evaluated_at, created_at) < week_to;

  select count(*) into exercises_total
  from public.vocal_exercise_attempts
  where student_id = auth.uid()
    and status in ('evaluated', 'shared');

  select coalesce(sum(seconds), 0) into practice_sec_week
  from public.practice_log
  where user_id = auth.uid()
    and created_at >= week_from
    and created_at < week_to;

  select coalesce(sum(seconds), 0) into practice_sec_total
  from public.practice_log
  where user_id = auth.uid();

  select coalesce(sum(seconds), 0) into analyzer_sec_week
  from public.practice_log
  where user_id = auth.uid()
    and kind = 'analyzer'
    and created_at >= week_from
    and created_at < week_to;

  select coalesce(sum(seconds), 0) into mixer_sec_week
  from public.practice_log
  where user_id = auth.uid()
    and kind = 'mixer'
    and created_at >= week_from
    and created_at < week_to;

  select (
    (
      select count(*)
      from public.chat_messages
      where student_id = auth.uid()
        and sender_id = auth.uid()
        and coalesce(message_type, 'text') <> 'announcement'
        and created_at >= week_from
        and created_at < week_to
    ) + (
      select count(*)
      from public.group_chat_messages as m
      join public.group_chat_members as mem
        on mem.group_id = m.group_id and mem.student_id = auth.uid()
      where m.sender_id = auth.uid()
        and m.created_at >= week_from
        and m.created_at < week_to
    ) + (
      select count(*)
      from public.vocal_test_results
      where user_id = auth.uid()
        and review_status in ('pending', 'approved')
        and created_at >= week_from
        and created_at < week_to
    )
  ) into connect_week;

  select jsonb_build_object(
    'id', les.id,
    'datetime', les.datetime,
    'status', les.status
  )
  into next_lesson
  from public.lessons as les
  where les.student_id = auth.uid()
    and les.status = 'scheduled'
    and les.datetime >= now()
  order by les.datetime
  limit 1;

  return jsonb_build_object(
    'today', today,
    'week_start', week_start,
    'streak', coalesce(profile.cat_streak_days, 0),
    'checked_in_today', profile.cat_last_checkin_on is not distinct from today,
    'cabinet_days', cabinet_days,
    'lessons_week', lessons_week,
    'practice_sec_week', practice_sec_week,
    'exercises_week', exercises_week,
    'connect_week', connect_week,
    'targets', jsonb_build_object(
      'cabinet_days', 5,
      'lessons', 1,
      'practice_min', 20,
      'exercises', 3,
      'connect', 1
    ),
    'stats', jsonb_build_object(
      'practice_sec_week', practice_sec_week,
      'practice_sec_total', practice_sec_total,
      'lessons_week', lessons_week,
      'lessons_total', lessons_total,
      'exercises_week', exercises_week,
      'exercises_total', exercises_total,
      'analyzer_sec_week', analyzer_sec_week,
      'mixer_sec_week', mixer_sec_week
    ),
    'next_lesson', next_lesson
  );
end;
$$;

revoke all on function public.student_cabinet_progress() from public, anon;
grant execute on function public.student_cabinet_progress() to authenticated;

create or replace function public.award_cat_xp(
  p_kind text,
  p_source_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := public.cat_studio_today();
  week_start date := public.cat_studio_week_start(today);
  profile public.profiles%rowtype;
  source text;
  amount integer;
  new_streak integer;
  result jsonb;
  remaining integer;
  streak_bonus integer := 0;
  extra jsonb;
  lessons_granted integer := 0;
  lesson_xp integer := 0;
begin
  if public.current_user_is_admin() then
    return jsonb_build_object('awarded', 0, 'already', true, 'admin', true);
  end if;

  select * into profile from public.profiles where id = auth.uid();
  if not found or profile.role <> 'student' then
    raise exception 'Student profile required';
  end if;

  if p_kind = 'checkin' then
    lessons_granted := public.grant_due_lesson_cat_xp();
    lesson_xp := lessons_granted * 8;
    source := today::text;
    amount := 1;
    remaining := public.cat_xp_daily_remaining(auth.uid());
    if profile.cat_last_checkin_on is distinct from today then
      if profile.cat_last_checkin_on = today - 1 then
        new_streak := profile.cat_streak_days + 1;
      else
        new_streak := 1;
      end if;
      update public.profiles
      set cat_last_checkin_on = today,
          cat_streak_days = new_streak
      where id = auth.uid();
    else
      new_streak := profile.cat_streak_days;
    end if;

    if remaining >= amount then
      result := public.apply_cat_xp(auth.uid(), 'checkin', amount, source);
    else
      select * into profile from public.profiles where id = auth.uid();
      result := jsonb_build_object(
        'awarded', 0,
        'capped', true,
        'xp', profile.cat_xp,
        'threshold', public.cat_level_threshold(profile.cat_level),
        'exam_ready', profile.cat_exam_ready,
        'streak', new_streak
      );
    end if;

    if coalesce((result->>'awarded')::int, 0) > 0
       and new_streak >= 3
       and public.cat_xp_daily_remaining(auth.uid()) >= 1 then
      extra := public.apply_cat_xp(
        auth.uid(), 'streak', 1, 'streak3-' || week_start::text
      );
      if coalesce((extra->>'awarded')::int, 0) > 0 then
        streak_bonus := streak_bonus + 1;
      end if;
    end if;

    if coalesce((result->>'awarded')::int, 0) > 0
       and new_streak > 0
       and new_streak % 7 = 0
       and public.cat_xp_daily_remaining(auth.uid()) >= 1 then
      extra := public.apply_cat_xp(
        auth.uid(), 'streak', 1, 'streak-' || source
      );
      if coalesce((extra->>'awarded')::int, 0) > 0 then
        streak_bonus := streak_bonus + 1;
      end if;
    end if;

    return result || jsonb_build_object(
      'streak', new_streak,
      'streak_bonus', streak_bonus,
      'lesson_xp', lesson_xp,
      'lessons_granted', lessons_granted
    );
  end if;

  remaining := public.cat_xp_daily_remaining(auth.uid());

  if p_kind = 'analyzer' then
    amount := 2;
    if remaining < amount then
      return jsonb_build_object(
        'awarded', 0, 'capped', true, 'xp', profile.cat_xp,
        'threshold', public.cat_level_threshold(profile.cat_level),
        'exam_ready', profile.cat_exam_ready, 'streak', profile.cat_streak_days
      );
    end if;
    return public.apply_cat_xp(auth.uid(), 'analyzer', amount, today::text);
  end if;

  if p_kind = 'practice' then
    amount := 1;
    if remaining < amount then
      return jsonb_build_object(
        'awarded', 0, 'capped', true, 'xp', profile.cat_xp,
        'threshold', public.cat_level_threshold(profile.cat_level),
        'exam_ready', profile.cat_exam_ready, 'streak', profile.cat_streak_days
      );
    end if;
    return public.apply_cat_xp(auth.uid(), 'practice', amount, today::text);
  end if;

  if p_kind = 'mixer' then
    amount := 1;
    if remaining < amount then
      return jsonb_build_object(
        'awarded', 0, 'capped', true, 'xp', profile.cat_xp,
        'threshold', public.cat_level_threshold(profile.cat_level),
        'exam_ready', profile.cat_exam_ready, 'streak', profile.cat_streak_days
      );
    end if;
    return public.apply_cat_xp(auth.uid(), 'mixer', amount, today::text);
  end if;

  if p_kind = 'chat' then
    amount := 1;
    if remaining < amount then
      return jsonb_build_object(
        'awarded', 0, 'capped', true, 'xp', profile.cat_xp,
        'threshold', public.cat_level_threshold(profile.cat_level),
        'exam_ready', profile.cat_exam_ready, 'streak', profile.cat_streak_days
      );
    end if;
    return public.apply_cat_xp(auth.uid(), 'chat', amount, today::text);
  end if;

  if p_kind = 'exercise' then
    if p_source_id is null or p_source_id = '' then
      raise exception 'Attempt id required';
    end if;
    if not exists (
      select 1 from public.vocal_exercise_attempts
      where id = p_source_id::uuid
        and student_id = auth.uid()
        and status in ('evaluated', 'shared', 'rejected')
    ) then
      raise exception 'Attempt was not found';
    end if;
    amount := 1;
    if remaining < amount then
      return jsonb_build_object(
        'awarded', 0, 'capped', true, 'xp', profile.cat_xp,
        'threshold', public.cat_level_threshold(profile.cat_level),
        'exam_ready', profile.cat_exam_ready, 'streak', profile.cat_streak_days
      );
    end if;
    return public.apply_cat_xp(
      auth.uid(), 'exercise', amount, 'exercise:' || today::text
    );
  end if;

  if p_kind = 'exercise_share' then
    if p_source_id is null or p_source_id = '' then
      raise exception 'Attempt id required';
    end if;
    if not exists (
      select 1
      from public.vocal_exercise_attempts as attempt
      join public.exercise_phrases as p on p.id = attempt.phrase_id
      where attempt.id = p_source_id::uuid
        and attempt.student_id = auth.uid()
        and attempt.status in ('evaluated', 'shared')
    ) then
      raise exception 'Attempt was not found';
    end if;
    amount := 5;
    if remaining < amount then
      return jsonb_build_object(
        'awarded', 0, 'capped', true, 'xp', profile.cat_xp,
        'threshold', public.cat_level_threshold(profile.cat_level),
        'exam_ready', profile.cat_exam_ready, 'streak', profile.cat_streak_days
      );
    end if;
    return public.apply_cat_xp(
      auth.uid(),
      'exercise_share',
      amount,
      'share:' || today::text
    );
  end if;

  if p_kind = 'pro_test' then
    raise exception 'Pro test XP is awarded after teacher review';
  end if;

  raise exception 'Unknown cat XP kind';
end;
$$;

revoke all on function public.award_cat_xp(text, text) from public;
grant execute on function public.award_cat_xp(text, text) to authenticated;
