-- Lesson XP + once-per-day per exercise/test. Safe to re-run.

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
    'pro_test',
    'streak',
    'lesson'
  ));

create or replace function public.grant_due_lesson_cat_xp()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  les record;
  granted integer := 0;
  outcome jsonb;
  only_student uuid := null;
begin
  if auth.role() <> 'service_role' then
    if public.current_user_is_admin() then
      return 0;
    end if;
    only_student := auth.uid();
    if only_student is null then
      return 0;
    end if;
  end if;

  for les in
    select id, student_id
    from public.lessons
    where student_id is not null
      and status in ('scheduled', 'completed')
      and datetime + interval '1 hour' <= now()
      and datetime >= now() - interval '7 days'
      and (only_student is null or student_id = only_student)
  loop
    outcome := public.apply_cat_xp(
      les.student_id,
      'lesson',
      8,
      'lesson:' || les.id::text
    );
    if coalesce((outcome->>'awarded')::int, 0) > 0 then
      granted := granted + 1;
    end if;
  end loop;

  return granted;
end;
$$;

revoke all on function public.grant_due_lesson_cat_xp() from public;
grant execute on function public.grant_due_lesson_cat_xp() to authenticated;
grant execute on function public.grant_due_lesson_cat_xp() to service_role;

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
  profile public.profiles%rowtype;
  source text;
  amount integer;
  new_streak integer;
  result jsonb;
  exercise_id uuid;
begin
  if public.current_user_is_admin() then
    return jsonb_build_object('awarded', 0, 'already', true, 'admin', true);
  end if;

  select * into profile from public.profiles where id = auth.uid();
  if not found or profile.role <> 'student' then
    raise exception 'Student profile required';
  end if;

  if p_kind = 'checkin' then
    perform public.grant_due_lesson_cat_xp();
    source := today::text;
    amount := 1;
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
    result := public.apply_cat_xp(auth.uid(), 'checkin', amount, source);
    if coalesce((result->>'awarded')::int, 0) > 0
       and new_streak > 0
       and new_streak % 7 = 0 then
      perform public.apply_cat_xp(
        auth.uid(), 'streak', 1, 'streak-' || source
      );
      result := result || jsonb_build_object('streak_bonus', 1, 'streak', new_streak);
    else
      result := result || jsonb_build_object('streak', new_streak);
    end if;
    return result;
  end if;

  if p_kind = 'analyzer' then
    return public.apply_cat_xp(auth.uid(), 'analyzer', 2, today::text);
  end if;

  if p_kind = 'exercise_share' then
    if p_source_id is null or p_source_id = '' then
      raise exception 'Attempt id required';
    end if;
    select p.exercise_id into exercise_id
    from public.vocal_exercise_attempts as attempt
    join public.exercise_phrases as p on p.id = attempt.phrase_id
    where attempt.id = p_source_id::uuid
      and attempt.student_id = auth.uid()
      and attempt.status in ('evaluated', 'shared');
    if exercise_id is null then
      raise exception 'Attempt was not found';
    end if;
    return public.apply_cat_xp(
      auth.uid(),
      'exercise_share',
      5,
      'ex:' || exercise_id::text || ':' || today::text
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

create or replace function public.review_vocal_test(
  p_result_id uuid,
  p_approve boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.vocal_test_results%rowtype;
  source text;
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;
  update public.vocal_test_results
  set review_status = case when p_approve then 'approved' else 'rejected' end
  where id = p_result_id
    and review_status in ('pending', 'none')
  returning * into result;
  if not found then
    raise exception 'Test is already reviewed or missing';
  end if;
  if p_approve then
    source := 'test:' || result.mode || ':' ||
      coalesce(nullif(result.target_label, ''), 'scale') || ':' ||
      public.cat_studio_today()::text;
    perform public.apply_cat_xp(result.user_id, 'pro_test', 8, source);
  end if;
end;
$$;

revoke all on function public.review_vocal_test(uuid, boolean) from public;
grant execute on function public.review_vocal_test(uuid, boolean) to authenticated;
