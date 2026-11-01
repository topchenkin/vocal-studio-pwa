-- Auto-complete unpaid one-time lessons with debt, same as admin complete_lesson.
-- Previously cron passed allow_debt=false, so a finished unpaid one_time
-- closed without debt_amount. Abonement still deducts 1 or accrues pack/4
-- regardless of this flag.

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
      and l.datetime + make_interval(mins => coalesce((
        select p.lesson_duration_min
        from public.profiles as p
        where p.id = l.student_id
      ), 60)) <= now()
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
    perform public.apply_lesson_completion_charge(les.student_id, les.paid_at, true);

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

notify pgrst, 'reload schema';
