-- Owner pack: auto-complete lessons (paid deduct only), practice goals without
-- phrase scoring, practice-share notifications. Safe to re-run.

create or replace function public.request_is_service_role()
returns boolean
language plpgsql
stable
as $$
declare
  jwt_role text;
  claims jsonb;
  session_role text := coalesce(auth.role(), '');
begin
  if session_role = 'service_role' then
    return true;
  end if;
  jwt_role := current_setting('request.jwt.claim.role', true);
  if jwt_role = 'service_role' then
    return true;
  end if;
  begin
    claims := coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb;
    if claims->>'role' = 'service_role' then
      return true;
    end if;
  exception when others then
    null;
  end;
  if session_role in ('authenticated', 'anon') then
    return false;
  end if;
  -- psql / apply scripts run as postgres without a user JWT.
  if current_user in ('postgres', 'supabase_admin') then
    return true;
  end if;
  return false;
end;
$$;

revoke all on function public.request_is_service_role() from public, anon, authenticated;
grant execute on function public.request_is_service_role() to service_role;

-- Deduct abonement only when the lesson is covered by a paid package.
-- Debt is opt-in (admin complete / late cancel), never on the cron path.
create or replace function public.apply_lesson_completion_charge(
  p_student_id uuid,
  p_paid_at timestamptz,
  p_allow_debt boolean
)
returns void
language plpgsql
as $$
declare
  target_pay_type text;
  target_lesson_price numeric(10, 2);
  target_balance integer;
begin
  select lesson_pay_type, custom_lesson_price, lessons_balance
  into target_pay_type, target_lesson_price, target_balance
  from public.profiles
  where id = p_student_id
  for update;

  if target_pay_type = 'abonement' then
    if coalesce(target_balance, 0) > 0 then
      update public.profiles
      set lessons_balance = greatest(lessons_balance - 1, 0)
      where id = p_student_id;
    elsif p_allow_debt then
      update public.profiles
      set debt_amount = debt_amount + coalesce(target_lesson_price, 0)
      where id = p_student_id;
    end if;
  elsif p_paid_at is null and p_allow_debt then
    update public.profiles
    set debt_amount = debt_amount + coalesce(target_lesson_price, 0)
    where id = p_student_id;
  end if;
end;
$$;

revoke all on function public.apply_lesson_completion_charge(uuid, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.apply_lesson_completion_charge(uuid, timestamptz, boolean)
  to service_role;

create or replace function public.complete_lesson(lesson_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_student_id uuid;
  target_paid_at timestamptz;
  target_when timestamptz;
  target_reschedule text;
  target_cancel text;
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;

  select student_id, paid_at, datetime, reschedule_request, cancel_request
  into target_student_id, target_paid_at, target_when, target_reschedule, target_cancel
  from public.lessons
  where id = lesson_id and status = 'scheduled'
  for update;

  if target_student_id is null then
    raise exception 'Scheduled lesson with a student was not found';
  end if;

  if target_when > now() then
    raise exception 'Cannot complete a future lesson';
  end if;

  if target_reschedule = 'pending' or target_cancel = 'pending' then
    raise exception 'Resolve the pending request first';
  end if;

  perform public.apply_lesson_completion_charge(target_student_id, target_paid_at, true);

  update public.lessons
  set status = 'completed'
  where id = lesson_id;
end;
$$;

revoke all on function public.complete_lesson(uuid) from public;
grant execute on function public.complete_lesson(uuid) to authenticated;

create or replace function public.auto_complete_started_lessons()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  les record;
  closed integer := 0;
  skip_unpaid_before timestamptz := now() - interval '8 days';
begin
  if not public.request_is_service_role() then
    raise exception 'auto_complete_started_lessons requires service_role (got %)', coalesce(auth.role(), '?');
  end if;

  for les in
    select l.id, l.student_id, l.paid_at
    from public.lessons as l
    where l.status = 'scheduled'
      and l.student_id is not null
      and l.datetime + interval '1 hour' <= now()
      and coalesce(l.reschedule_request, 'none') <> 'pending'
      and coalesce(l.cancel_request, 'none') <> 'pending'
      and (
        l.paid_at is not null
        or l.datetime >= skip_unpaid_before
        or exists (
          select 1
          from public.profiles as p
          where p.id = l.student_id
            and p.lesson_pay_type = 'abonement'
        )
      )
    order by l.datetime
    for update skip locked
  loop
    perform public.apply_lesson_completion_charge(les.student_id, les.paid_at, false);

    update public.lessons
    set status = 'completed'
    where id = les.id;

    closed := closed + 1;
  end loop;

  return closed;
end;
$$;

revoke all on function public.auto_complete_started_lessons() from public;
grant execute on function public.auto_complete_started_lessons() to service_role;

create or replace function public.charge_late_cancel(target_lesson_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_student_id uuid;
  target_when timestamptz;
  target_paid_at timestamptz;
begin
  select student_id, datetime, paid_at
  into target_student_id, target_when, target_paid_at
  from public.lessons
  where id = target_lesson_id;

  if target_student_id is null then
    return;
  end if;
  if target_when - now() >= interval '24 hours' then
    return;
  end if;

  perform public.apply_lesson_completion_charge(target_student_id, target_paid_at, true);
end;
$$;

revoke all on function public.charge_late_cancel(uuid) from public;
revoke all on function public.charge_late_cancel(uuid) from authenticated;

create or replace function public.chat_notification_preview(raw text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(raw, '') like '%UVS_EXERCISE_VOICE%'
      then 'Запись упражнения'
    when coalesce(raw, '') like '%UVS_EXERCISE_RESULT%'
      or coalesce(raw, '') like '%"kind":"exercise_practice"%'
      or coalesce(raw, '') like '%Результаты упражнения%'
      or coalesce(raw, '') like '%отправил%практик%'
      then 'Практика с упражнения'
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
    or coalesce(new.message, '') like '%"kind":"exercise_practice"%'
    or coalesce(new.message, '') like '%Результаты упражнения%'
    or coalesce(new.message, '') like '%отправил%практик%';
  is_exercise_voice boolean := coalesce(new.message, '') like '%UVS_EXERCISE_VOICE%';
  action text;
  notify_title text;
  notify_body text;
begin
  if is_exercise_voice then
    return new;
  end if;

  if is_exercise_result then
    notify_title := new.sender_name || ' отправил(а) практику';
    notify_body := new.sender_name || ' отправил(а) практику';
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

create or replace function public.student_cabinet_progress()
returns jsonb
language plpgsql
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
  next_lesson jsonb;
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

  select greatest(
    (
      select count(distinct day)
      from public.practice_log
      where user_id = auth.uid()
        and kind = 'exercise'
        and day >= week_start
        and day < week_start + 7
    ),
    case
      when exists (
        select 1
        from public.cat_xp_events
        where user_id = auth.uid()
          and kind = 'exercise_share'
          and created_at >= week_from
          and created_at < week_to
      ) then 3
      else 0
    end
  )
  into exercises_week;

  select count(distinct day) into exercises_total
  from public.practice_log
  where user_id = auth.uid()
    and kind = 'exercise';

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

-- Safe backfill of clearly past paid/abonement scheduled lessons.
select public.auto_complete_started_lessons();
