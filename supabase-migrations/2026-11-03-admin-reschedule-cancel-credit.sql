-- 1) Cancel before the lesson starts must not consume an abonement credit.
-- 2) Admin can move a scheduled lesson without a student request.

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
  -- Lesson has not started: never deduct a pack / accrue debt.
  if target_when > now() then
    return;
  end if;

  perform public.apply_lesson_completion_charge(target_student_id, target_paid_at, true);
end;
$$;

revoke all on function public.charge_late_cancel(uuid) from public;
revoke all on function public.charge_late_cancel(uuid) from authenticated;
grant execute on function public.charge_late_cancel(uuid) to service_role;

create or replace function public.admin_reschedule_lesson(
  lesson_id uuid,
  new_datetime timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_student_id uuid;
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;
  if new_datetime is null then
    raise exception 'New datetime is required';
  end if;

  update public.lessons
  set
    datetime = new_datetime,
    reschedule_request = 'none',
    preferred_reschedule_at = null,
    reschedule_note = null,
    reschedule_requested_at = null,
    cancel_request = 'none',
    cancel_note = null
  where id = lesson_id
    and status = 'scheduled'
  returning student_id into target_student_id;

  if not found then
    raise exception 'Scheduled lesson was not found';
  end if;

  if target_student_id is not null then
    insert into public.notifications (
      recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
    )
    values (
      target_student_id,
      'student',
      'Урок перенесён',
      'Администратор перенёс урок на '
        || to_char(new_datetime at time zone 'Asia/Yekaterinburg', 'DD.MM.YYYY HH24:MI')
        || '.',
      'lesson',
      '/dashboard/student?tab=lessons',
      now() + interval '5 minutes'
    );
  end if;
end;
$$;

revoke all on function public.admin_reschedule_lesson(uuid, timestamptz) from public;
grant execute on function public.admin_reschedule_lesson(uuid, timestamptz) to authenticated;

notify pgrst, 'reload schema';
