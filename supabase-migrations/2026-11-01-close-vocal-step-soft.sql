-- close_vocal_step is a gamification side-effect, not the recording save.
-- Never raise: a 400 here looked like "the take was lost" while chat upload
-- already succeeded.

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
    return jsonb_build_object('admin', true, 'closed', true);
  end if;
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'student'
  ) then
    return jsonb_build_object('closed', false, 'reason', 'not_student');
  end if;
  if kind not in ('phrase', 'exercise') or mark not in ('ok', 'again') or ref = '' then
    return jsonb_build_object('closed', false, 'reason', 'bad_step');
  end if;
  if kind = 'phrase'
     and ref is distinct from (public.vocal_daily_phrase(today)->>'id')
     and not exists (
       select 1 from public.vocal_reviews
       where user_id = auth.uid() and ref_id = ref and next_on <= today
     ) then
    return jsonb_build_object('closed', false, 'reason', 'unknown_phrase');
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

notify pgrst, 'reload schema';
