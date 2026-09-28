-- Daily sing loop: phrase, quests, path, streak freeze, reviews, duo day.
-- Cat thresholds and the 12 XP daily cap stay as they are.

alter table public.profiles
  add column if not exists streak_freeze_week date,
  add column if not exists best_streak integer not null default 0,
  add column if not exists best_phrase_sec integer not null default 0,
  add column if not exists comeback_on date;

update public.profiles
set best_streak = cat_streak_days
where coalesce(best_streak, 0) < coalesce(cat_streak_days, 0);

create table if not exists public.vocal_day_steps (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('visit', 'phrase', 'exercise')),
  ref_id text not null check (char_length(ref_id) between 1 and 80),
  mark text not null check (mark in ('ok', 'again')),
  seconds integer not null default 0 check (seconds >= 0 and seconds <= 180),
  title text not null default '',
  primary key (user_id, day, kind, ref_id)
);

create table if not exists public.vocal_reviews (
  user_id uuid not null references public.profiles(id) on delete cascade,
  ref_id text not null check (char_length(ref_id) between 1 and 80),
  title text not null default '',
  next_on date not null,
  gap_days integer not null default 1 check (gap_days in (1, 3, 7)),
  primary key (user_id, ref_id)
);

create table if not exists public.vocal_path_done (
  user_id uuid not null references public.profiles(id) on delete cascade,
  ref_id text not null check (char_length(ref_id) between 1 and 80),
  done_on date not null,
  primary key (user_id, ref_id)
);

alter table public.vocal_day_steps enable row level security;
alter table public.vocal_reviews enable row level security;
alter table public.vocal_path_done enable row level security;

drop policy if exists "vocal_day_steps_read_own" on public.vocal_day_steps;
create policy "vocal_day_steps_read_own"
on public.vocal_day_steps for select to authenticated
using (user_id = auth.uid() or public.current_user_is_admin());

drop policy if exists "vocal_reviews_read_own" on public.vocal_reviews;
create policy "vocal_reviews_read_own"
on public.vocal_reviews for select to authenticated
using (user_id = auth.uid() or public.current_user_is_admin());

drop policy if exists "vocal_path_done_read_own" on public.vocal_path_done;
create policy "vocal_path_done_read_own"
on public.vocal_path_done for select to authenticated
using (user_id = auth.uid() or public.current_user_is_admin());

revoke insert, update, delete on public.vocal_day_steps from public, anon, authenticated;
revoke insert, update, delete on public.vocal_reviews from public, anon, authenticated;
revoke insert, update, delete on public.vocal_path_done from public, anon, authenticated;

create or replace function public.vocal_daily_phrase(p_day date)
returns jsonb
language sql
stable
as $$
  with phrases(ord, id, title, line) as (
    values
      (0, 'ma', 'Ма на опоре', 'Протяните «ма» на одном удобном звуке.'),
      (1, 'mi', 'Ми мягко', 'Короткое «ми» снизу вверх, без толчка.'),
      (2, 'lu', 'Лу на губах', '«Лу» на одном дыхании, губы вперёд.'),
      (3, 'ne', 'Нэ в маске', '«Нэ» в нос и щёки, челюсть свободна.'),
      (4, 'bra', 'Бра на атаке', 'Мягкая атака: «бра» и сразу ровный звук.'),
      (5, 'si', 'Си тихо', 'Тихое «си», чтобы не зажимать горло.'),
      (6, 'vo', 'Во широко', '«Во» с открытым ртом и спокойным выдохом.'),
      (7, 'nu', 'Ну выше', '«Ну» на полтона выше, чем удобно.')
  )
  select jsonb_build_object('id', id, 'title', title, 'line', line)
  from phrases
  where ord = mod((p_day - date '2026-01-01'), 8);
$$;

revoke all on function public.vocal_daily_phrase(date) from public, anon, authenticated;

create or replace function public.student_retention_board()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today date := public.cat_studio_today();
  week_start date := public.cat_studio_week_start(today);
  profile public.profiles%rowtype;
  phrase jsonb;
  phrase_id text;
  phrase_done boolean := false;
  minute_done boolean := false;
  path jsonb := '[]'::jsonb;
  reviews jsonb := '[]'::jsonb;
  partner uuid;
  partner_done boolean := false;
  together boolean := false;
  duo_streak integer := 0;
  walk date;
  guard integer := 0;
  best_week integer := 0;
  week_min integer := 0;
begin
  if public.current_user_is_admin() then
    return jsonb_build_object('admin', true);
  end if;
  select * into profile from public.profiles where id = auth.uid();
  if not found or profile.role <> 'student' then
    raise exception 'Student profile required';
  end if;

  phrase := public.vocal_daily_phrase(today);
  phrase_id := phrase->>'id';
  phrase_done := exists (
    select 1 from public.vocal_day_steps
    where user_id = auth.uid() and day = today and kind = 'phrase' and ref_id = phrase_id
  );
  minute_done := coalesce((
    select sum(seconds) from public.practice_log
    where user_id = auth.uid() and day = today
  ), 0) >= 60;

  with nodes as (
    select id, title, rn, total,
      exists (
        select 1 from public.vocal_path_done d
        where d.user_id = auth.uid() and d.ref_id = nodes_src.id
      ) as done
    from (
      select id::text as id, title,
        row_number() over (order by created_at) as rn,
        count(*) over () as total
      from public.exercises
      where coalesce(is_published, false)
    ) nodes_src
    where rn <= 12
  ),
  fallback as (
    select id, title, rn, total, done from nodes
    union all
    select p.id, p.title, p.ord + 1, 8,
      exists (
        select 1 from public.vocal_path_done d
        where d.user_id = auth.uid() and d.ref_id = p.id
      )
    from (
      values
        (0, 'ma', 'Ма на опоре'),
        (1, 'mi', 'Ми мягко'),
        (2, 'lu', 'Лу на губах'),
        (3, 'ne', 'Нэ в маске'),
        (4, 'bra', 'Бра на атаке'),
        (5, 'si', 'Си тихо'),
        (6, 'vo', 'Во широко'),
        (7, 'nu', 'Ну выше')
    ) as p(ord, id, title)
    where not exists (select 1 from nodes)
  ),
  marked as (
    select *,
      coalesce(
        (select min(rn) from fallback f2 where not f2.done),
        (select max(rn) from fallback)
      ) as current_rn
    from fallback
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'title', title,
      'stage', (array['Дыхание','Атака','Гласные','Диапазон','Песня'])[
        least(4, ((rn - 1) * 5 / greatest(total, 1))) + 1
      ],
      'state', case
        when done and rn is distinct from current_rn then 'done'
        when rn = current_rn then 'current'
        else 'locked'
      end
    )
    order by rn
  ), '[]'::jsonb)
  into path
  from marked;

  select coalesce(jsonb_agg(
    jsonb_build_object('id', ref_id, 'title', title)
    order by next_on
  ), '[]'::jsonb)
  into reviews
  from (
    select ref_id, title, next_on
    from public.vocal_reviews
    where user_id = auth.uid() and next_on <= today
    order by next_on
    limit 3
  ) due;

  select case
    when owner_id = auth.uid() then partner_id
    else owner_id
  end
  into partner
  from public.duo_subscriptions
  where status = 'active'
    and partner_id is not null
    and (owner_id = auth.uid() or partner_id = auth.uid())
  limit 1;

  if partner is not null then
    partner_done := exists (
      select 1 from public.vocal_day_steps
      where user_id = partner and day = today and kind in ('visit', 'phrase')
    );
    together := partner_done and exists (
      select 1 from public.vocal_day_steps
      where user_id = auth.uid() and day = today and kind in ('visit', 'phrase')
    );
    walk := case when together then today else today - 1 end;
    while guard < 60 and exists (
      select 1 from public.vocal_day_steps
      where user_id = auth.uid() and day = walk and kind in ('visit', 'phrase')
    ) and exists (
      select 1 from public.vocal_day_steps
      where user_id = partner and day = walk and kind in ('visit', 'phrase')
    ) loop
      duo_streak := duo_streak + 1;
      walk := walk - 1;
      guard := guard + 1;
    end loop;
  end if;

  select coalesce(max(sec), 0) / 60, coalesce(max(sec) filter (
    where wk = week_start
  ), 0) / 60
  into best_week, week_min
  from (
    select public.cat_studio_week_start(day) as wk, sum(seconds) as sec
    from public.practice_log
    where user_id = auth.uid()
    group by 1
  ) weeks;

  return jsonb_build_object(
    'today', today,
    'phrase', phrase || jsonb_build_object('done', phrase_done),
    'quests', jsonb_build_object(
      'cabinet', profile.cat_last_checkin_on = today,
      'phrase', phrase_done,
      'minute', minute_done
    ),
    'streak', coalesce(profile.cat_streak_days, 0),
    'freeze_left', profile.streak_freeze_week is distinct from week_start,
    'comeback', coalesce(profile.comeback_on = today, false),
    'path', path,
    'reviews', reviews,
    'records', jsonb_build_object(
      'best_streak', greatest(coalesce(profile.best_streak, 0), coalesce(profile.cat_streak_days, 0)),
      'best_week_min', best_week,
      'week_min', week_min,
      'best_phrase_sec', coalesce(profile.best_phrase_sec, 0)
    ),
    'duo', case
      when partner is null then null
      else jsonb_build_object(
        'active', true,
        'partner_done', partner_done,
        'together', together,
        'streak', duo_streak
      )
    end
  );
end;
$$;

revoke all on function public.student_retention_board() from public, anon;
grant execute on function public.student_retention_board() to authenticated;

create or replace function public.close_vocal_step(
  p_kind text,
  p_ref text,
  p_title text,
  p_mark text,
  p_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := public.cat_studio_today();
  kind text := lower(trim(coalesce(p_kind, '')));
  ref text := left(trim(coalesce(p_ref, '')), 80);
  title text := left(trim(coalesce(p_title, '')), 120);
  mark text := lower(trim(coalesce(p_mark, '')));
  secs integer := least(greatest(coalesce(p_seconds, 0), 0), 180);
  prev_gap integer;
  next_gap integer;
begin
  if public.current_user_is_admin() then
    return jsonb_build_object('admin', true);
  end if;
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'student'
  ) then
    raise exception 'Student profile required';
  end if;
  if kind not in ('phrase', 'exercise') or mark not in ('ok', 'again') or ref = '' then
    raise exception 'Unknown vocal step';
  end if;
  if kind = 'phrase'
     and ref is distinct from (public.vocal_daily_phrase(today)->>'id')
     and not exists (
       select 1 from public.vocal_reviews
       where user_id = auth.uid() and ref_id = ref and next_on <= today
     ) then
    raise exception 'Unknown vocal step';
  end if;
  if kind = 'exercise' and not exists (
    select 1 from public.exercises where id::text = ref
  ) then
    raise exception 'Unknown vocal step';
  end if;

  insert into public.vocal_day_steps (user_id, day, kind, ref_id, mark, seconds, title)
  values (auth.uid(), today, kind, ref, mark, secs, title)
  on conflict (user_id, day, kind, ref_id) do update
  set mark = excluded.mark,
      seconds = greatest(public.vocal_day_steps.seconds, excluded.seconds),
      title = excluded.title;

  if mark = 'again' then
    select gap_days into prev_gap
    from public.vocal_reviews
    where user_id = auth.uid() and ref_id = ref;
    if prev_gap = 1 then
      next_gap := 3;
    elsif prev_gap = 3 then
      next_gap := 7;
    elsif prev_gap is null then
      next_gap := 1;
    else
      next_gap := 7;
    end if;
    insert into public.vocal_reviews (user_id, ref_id, title, next_on, gap_days)
    values (auth.uid(), ref, title, today + next_gap, next_gap)
    on conflict (user_id, ref_id) do update
    set title = excluded.title,
        next_on = excluded.next_on,
        gap_days = excluded.gap_days;
  else
    delete from public.vocal_reviews
    where user_id = auth.uid() and ref_id = ref;
    insert into public.vocal_path_done (user_id, ref_id, done_on)
    values (auth.uid(), ref, today)
    on conflict (user_id, ref_id) do update
    set done_on = excluded.done_on;
    if kind = 'phrase' and secs > 0 then
      update public.profiles
      set best_phrase_sec = greatest(coalesce(best_phrase_sec, 0), secs)
      where id = auth.uid();
    end if;
  end if;

  return jsonb_build_object('closed', true, 'mark', mark);
end;
$$;

revoke all on function public.close_vocal_step(text, text, text, text, integer) from public, anon;
grant execute on function public.close_vocal_step(text, text, text, text, integer) to authenticated;

create or replace function public.enqueue_streak_fading_pushes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := public.cat_studio_today();
  inserted integer := 0;
  hour integer;
begin
  hour := extract(hour from timezone('Asia/Yekaterinburg', now()))::int;
  if hour < 18 or hour > 21 then
    return 0;
  end if;

  insert into public.notifications (
    recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
  )
  select
    profile.id,
    'student',
    'Серия гаснет сегодня',
    'Одна фраза — и серия ' || profile.cat_streak_days || ' дн. останется с вами.',
    'general',
    '/dashboard/student',
    now() + interval '12 hours'
  from public.profiles as profile
  where profile.role = 'student'
    and coalesce(profile.cat_streak_days, 0) > 0
    and profile.cat_last_checkin_on = today - 1
    and not exists (
      select 1 from public.notifications note
      where note.recipient_id = profile.id
        and note.title = 'Серия гаснет сегодня'
        and note.created_at >= timezone('Asia/Yekaterinburg', today::timestamp)
    );
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.enqueue_streak_fading_pushes() from public, anon, authenticated;
grant execute on function public.enqueue_streak_fading_pushes() to service_role;

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
        new_streak := coalesce(profile.cat_streak_days, 0) + 1;
        update public.profiles
        set cat_last_checkin_on = today,
            cat_streak_days = new_streak,
            best_streak = greatest(coalesce(best_streak, 0), new_streak),
            comeback_on = null
        where id = auth.uid();
      elsif profile.cat_last_checkin_on = today - 2
        and coalesce(profile.cat_streak_days, 0) > 0
        and profile.streak_freeze_week is distinct from week_start then
        new_streak := profile.cat_streak_days + 1;
        update public.profiles
        set cat_last_checkin_on = today,
            cat_streak_days = new_streak,
            best_streak = greatest(coalesce(best_streak, 0), new_streak),
            streak_freeze_week = week_start,
            comeback_on = null
        where id = auth.uid();
      else
        new_streak := 1;
        update public.profiles
        set cat_last_checkin_on = today,
            cat_streak_days = 1,
            best_streak = greatest(coalesce(best_streak, 0), 1),
            comeback_on = case
              when profile.cat_last_checkin_on is not null
               and profile.cat_last_checkin_on < today - 1
              then today
              else null
            end
        where id = auth.uid();
      end if;
      insert into public.vocal_day_steps (user_id, day, kind, ref_id, mark, seconds, title)
      values (auth.uid(), today, 'visit', 'checkin', 'ok', 0, '')
      on conflict (user_id, day, kind, ref_id) do nothing;
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
