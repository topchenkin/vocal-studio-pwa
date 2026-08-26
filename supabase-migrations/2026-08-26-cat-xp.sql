-- Cat XP, daily check-in, exam-ready chat ping. Safe to re-run.

alter table public.profiles
  add column if not exists cat_xp integer not null default 0,
  add column if not exists cat_exam_ready boolean not null default false,
  add column if not exists cat_exam_notified_at timestamptz,
  add column if not exists cat_streak_days integer not null default 0,
  add column if not exists cat_last_checkin_on date;

alter table public.vocal_test_results
  add column if not exists review_status text not null default 'none';

alter table public.vocal_test_results
  drop constraint if exists vocal_test_results_review_status_check;
alter table public.vocal_test_results
  add constraint vocal_test_results_review_status_check
  check (review_status in ('none', 'pending', 'approved', 'rejected'));

create table if not exists public.cat_xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null
    check (kind in ('checkin', 'analyzer', 'exercise_share', 'pro_test', 'streak')),
  amount integer not null check (amount > 0 and amount <= 20),
  source_id text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists cat_xp_events_source_uidx
  on public.cat_xp_events (user_id, kind, source_id);

create index if not exists cat_xp_events_user_created_idx
  on public.cat_xp_events (user_id, created_at desc);

alter table public.cat_xp_events enable row level security;

drop policy if exists "cat_xp_events_read_own_or_admin" on public.cat_xp_events;
create policy "cat_xp_events_read_own_or_admin"
on public.cat_xp_events for select
to authenticated
using (user_id = auth.uid() or public.current_user_is_admin());

create or replace function public.cat_studio_today()
returns date
language sql
stable
as $$
  select (timezone('Asia/Yekaterinburg', now()))::date;
$$;

create or replace function public.cat_level_threshold(p_level text)
returns integer
language sql
immutable
as $$
  select case p_level
    when 'beginner' then 48
    when 'basic' then 280
    when 'pro' then 1100
    else 0
  end;
$$;

create or replace function public.cat_next_level_label(p_level text)
returns text
language sql
immutable
as $$
  select case p_level
    when 'beginner' then 'Певчий котик'
    when 'basic' then 'Джазовый кот'
    when 'pro' then 'Кот-Звезда'
    else null
  end;
$$;

create or replace function public.reset_cat_progress_on_level_change()
returns trigger
language plpgsql
as $$
begin
  if new.cat_level is distinct from old.cat_level then
    new.cat_xp := 0;
    new.cat_exam_ready := false;
    new.cat_exam_notified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_cat_level_change on public.profiles;
create trigger on_profile_cat_level_change
before update of cat_level on public.profiles
for each row
execute procedure public.reset_cat_progress_on_level_change();

create or replace function public.apply_cat_xp(
  p_user_id uuid,
  p_kind text,
  p_amount integer,
  p_source_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles%rowtype;
  threshold integer;
  next_label text;
  event_id uuid;
begin
  insert into public.cat_xp_events (user_id, kind, amount, source_id)
  values (p_user_id, p_kind, p_amount, p_source_id)
  on conflict do nothing
  returning id into event_id;
  if event_id is null then
    select * into profile from public.profiles where id = p_user_id;
    return jsonb_build_object(
      'awarded', 0,
      'already', true,
      'xp', coalesce(profile.cat_xp, 0),
      'threshold', public.cat_level_threshold(profile.cat_level),
      'exam_ready', profile.cat_exam_ready,
      'streak', profile.cat_streak_days
    );
  end if;

  update public.profiles
  set cat_xp = cat_xp + p_amount
  where id = p_user_id
  returning * into profile;

  threshold := public.cat_level_threshold(profile.cat_level);
  if threshold > 0 and profile.cat_xp >= threshold and not profile.cat_exam_ready then
    update public.profiles
    set cat_exam_ready = true
    where id = p_user_id
    returning * into profile;
  end if;

  if profile.cat_exam_ready
     and profile.cat_exam_notified_at is null
     and threshold > 0 then
    next_label := public.cat_next_level_label(profile.cat_level);
    insert into public.chat_messages (
      student_id, sender_id, sender_name, message, message_type
    ) values (
      p_user_id,
      p_user_id,
      'Кабинет',
      'Готов к экзамену на уровень «' || next_label ||
        '». Договоритесь о живой сдаче на занятии — в приложении экзамен не проводится.',
      'announcement'
    );
    update public.profiles
    set cat_exam_notified_at = now()
    where id = p_user_id
    returning * into profile;
  end if;

  return jsonb_build_object(
    'awarded', p_amount,
    'already', false,
    'xp', profile.cat_xp,
    'threshold', threshold,
    'exam_ready', profile.cat_exam_ready,
    'streak', profile.cat_streak_days
  );
end;
$$;

revoke all on function public.apply_cat_xp(uuid, text, integer, text) from public, anon, authenticated;

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
  today_shares integer;
  new_streak integer;
  result jsonb;
begin
  if public.current_user_is_admin() then
    return jsonb_build_object('awarded', 0, 'already', true, 'admin', true);
  end if;

  select * into profile from public.profiles where id = auth.uid();
  if not found or profile.role <> 'student' then
    raise exception 'Student profile required';
  end if;

  if p_kind = 'checkin' then
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
    if not exists (
      select 1 from public.vocal_exercise_attempts
      where id = p_source_id::uuid
        and student_id = auth.uid()
        and status in ('evaluated', 'shared')
    ) then
      raise exception 'Attempt was not found';
    end if;
    select count(*) into today_shares
    from public.cat_xp_events
    where user_id = auth.uid()
      and kind = 'exercise_share'
      and created_at >= timezone('Asia/Yekaterinburg', today::timestamp);
    if today_shares >= 2 then
      select * into profile from public.profiles where id = auth.uid();
      return jsonb_build_object(
        'awarded', 0,
        'already', true,
        'capped', true,
        'xp', profile.cat_xp,
        'threshold', public.cat_level_threshold(profile.cat_level),
        'exam_ready', profile.cat_exam_ready,
        'streak', profile.cat_streak_days
      );
    end if;
    return public.apply_cat_xp(auth.uid(), 'exercise_share', 5, p_source_id);
  end if;

  if p_kind = 'pro_test' then
    raise exception 'Pro test XP is awarded after teacher review';
  end if;

  raise exception 'Unknown cat XP kind';
end;
$$;

revoke all on function public.award_cat_xp(text, text) from public;
grant execute on function public.award_cat_xp(text, text) to authenticated;

create or replace function public.submit_vocal_test_for_review(p_result_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.vocal_test_results
  set review_status = 'pending'
  where id = p_result_id
    and user_id = auth.uid()
    and review_status = 'none'
    and too_quiet = false;
  if not found then
    update public.vocal_test_results
    set review_status = 'pending'
    where id = p_result_id
      and user_id = auth.uid()
      and review_status = 'pending';
    if not found then
      raise exception 'Test result was not found';
    end if;
  end if;
end;
$$;

revoke all on function public.submit_vocal_test_for_review(uuid) from public;
grant execute on function public.submit_vocal_test_for_review(uuid) to authenticated;

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
    perform public.apply_cat_xp(
      result.user_id, 'pro_test', 8, result.id::text
    );
  end if;
end;
$$;

revoke all on function public.review_vocal_test(uuid, boolean) from public;
grant execute on function public.review_vocal_test(uuid, boolean) to authenticated;
