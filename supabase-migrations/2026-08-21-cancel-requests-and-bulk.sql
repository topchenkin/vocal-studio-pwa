-- Student cancel requests (admin approve/reject) + admin bulk cancel per student.

alter table public.lessons
  add column if not exists cancel_request text not null default 'none',
  add column if not exists cancel_note text;

alter table public.lessons drop constraint if exists lessons_cancel_request_check;
alter table public.lessons
  add constraint lessons_cancel_request_check
  check (cancel_request in ('none', 'pending', 'rejected'));

update public.ai_tool_access
set title = 'Звёздный двойник'
where tool_id = 'timbre';

-- Reschedule cannot run while a cancel is pending.
create or replace function public.request_lesson_reschedule(
  lesson_id uuid,
  preferred_at timestamptz default null,
  student_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_when timestamptz;
  student_name text;
  notify_message text;
  note_clean text;
  preferred_text text;
  action_path text;
begin
  note_clean := nullif(left(trim(coalesce(student_note, '')), 200), '');

  update public.lessons
  set
    reschedule_request = 'pending',
    preferred_reschedule_at = preferred_at,
    reschedule_note = note_clean,
    reschedule_requested_at = now()
  where id = lesson_id
    and student_id = auth.uid()
    and status = 'scheduled'
    and reschedule_request in ('none', 'rejected')
    and cancel_request in ('none', 'rejected')
  returning datetime into current_when;

  if not found then
    raise exception 'Lesson is not available for a reschedule request';
  end if;

  select coalesce(
    nullif(trim(full_name), ''),
    nullif(trim(email), ''),
    'Ученик'
  )
  into student_name
  from public.profiles
  where id = auth.uid();

  student_name := coalesce(student_name, 'Ученик');
  notify_message :=
    student_name
    || ' запросил(а) перенос урока. Сейчас: '
    || to_char(current_when at time zone 'Europe/Moscow', 'DD.MM.YYYY HH24:MI');

  if preferred_at is not null then
    preferred_text := to_char(preferred_at at time zone 'Europe/Moscow', 'DD.MM.YYYY HH24:MI');
    notify_message := notify_message || '. Желаемое время: ' || preferred_text;
  end if;

  if note_clean is not null then
    notify_message := notify_message || '. Комментарий: ' || note_clean;
  end if;

  action_path :=
    '/dashboard/admin?tab=schedule&lesson='
    || lesson_id::text
    || '&date='
    || to_char(current_when at time zone 'Europe/Moscow', 'YYYY-MM-DD');

  insert into public.notifications (
    recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
  )
  select
    p.id,
    'admin',
    'Запрос переноса урока',
    notify_message,
    'lesson',
    action_path,
    now() + interval '5 minutes'
  from public.profiles p
  where p.role = 'admin';

  if not found then
    insert into public.notifications (
      recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
    )
    values (
      null,
      'admin',
      'Запрос переноса урока',
      notify_message,
      'lesson',
      action_path,
      now() + interval '5 minutes'
    );
  end if;
end;
$$;

revoke all on function public.request_lesson_reschedule(uuid, timestamptz, text) from public;
grant execute on function public.request_lesson_reschedule(uuid, timestamptz, text) to authenticated;

create or replace function public.request_lesson_cancel(
  lesson_id uuid,
  student_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_when timestamptz;
  student_name text;
  notify_message text;
  note_clean text;
  action_path text;
begin
  note_clean := nullif(left(trim(coalesce(student_note, '')), 200), '');

  update public.lessons
  set
    cancel_request = 'pending',
    cancel_note = note_clean
  where id = lesson_id
    and student_id = auth.uid()
    and status = 'scheduled'
    and cancel_request in ('none', 'rejected')
    and reschedule_request in ('none', 'rejected')
  returning datetime into current_when;

  if not found then
    raise exception 'Lesson is not available for a cancel request';
  end if;

  select coalesce(
    nullif(trim(full_name), ''),
    nullif(trim(email), ''),
    'Ученик'
  )
  into student_name
  from public.profiles
  where id = auth.uid();

  student_name := coalesce(student_name, 'Ученик');
  notify_message :=
    student_name
    || ' запросил(а) отмену урока. Сейчас: '
    || to_char(current_when at time zone 'Europe/Moscow', 'DD.MM.YYYY HH24:MI');

  if note_clean is not null then
    notify_message := notify_message || '. Комментарий: ' || note_clean;
  end if;

  action_path :=
    '/dashboard/admin?tab=schedule&lesson='
    || lesson_id::text
    || '&date='
    || to_char(current_when at time zone 'Europe/Moscow', 'YYYY-MM-DD');

  insert into public.notifications (
    recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
  )
  select
    p.id,
    'admin',
    'Запрос отмены урока',
    notify_message,
    'lesson',
    action_path,
    now() + interval '5 minutes'
  from public.profiles p
  where p.role = 'admin';

  if not found then
    insert into public.notifications (
      recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
    )
    values (
      null,
      'admin',
      'Запрос отмены урока',
      notify_message,
      'lesson',
      action_path,
      now() + interval '5 minutes'
    );
  end if;
end;
$$;

revoke all on function public.request_lesson_cancel(uuid, text) from public;
grant execute on function public.request_lesson_cancel(uuid, text) to authenticated;

create or replace function public.admin_resolve_cancel(
  lesson_id uuid,
  approve boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_student_id uuid;
  current_when timestamptz;
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;

  if approve then
    update public.lessons
    set
      status = 'cancelled',
      cancel_request = 'none',
      cancel_note = null,
      reschedule_request = 'none',
      preferred_reschedule_at = null,
      reschedule_note = null,
      reschedule_requested_at = null
    where id = lesson_id
      and status = 'scheduled'
      and cancel_request = 'pending'
    returning student_id, datetime into target_student_id, current_when;

    if not found then
      raise exception 'Cancel request was not found';
    end if;

    if target_student_id is not null then
      insert into public.notifications (
        recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
      )
      values (
        target_student_id,
        'student',
        'Урок отменён',
        'Администратор подтвердил отмену урока '
          || to_char(current_when at time zone 'Europe/Moscow', 'DD.MM.YYYY HH24:MI')
          || '.',
        'lesson',
        '/dashboard/student',
        now() + interval '5 minutes'
      );
    end if;
  else
    update public.lessons
    set cancel_request = 'rejected'
    where id = lesson_id
      and cancel_request = 'pending'
    returning student_id into target_student_id;

    if not found then
      raise exception 'Cancel request was not found';
    end if;

    if target_student_id is not null then
      insert into public.notifications (
        recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
      )
      values (
        target_student_id,
        'student',
        'Отмена отклонена',
        'Администратор отклонил запрос на отмену. Напишите в чат, если нужна помощь.',
        'lesson',
        '/dashboard/student',
        now() + interval '5 minutes'
      );
    end if;
  end if;
end;
$$;

revoke all on function public.admin_resolve_cancel(uuid, boolean) from public;
grant execute on function public.admin_resolve_cancel(uuid, boolean) to authenticated;

create or replace function public.admin_cancel_lesson(lesson_id uuid)
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

  update public.lessons
  set
    status = 'cancelled',
    cancel_request = 'none',
    cancel_note = null,
    reschedule_request = 'none',
    preferred_reschedule_at = null,
    reschedule_note = null,
    reschedule_requested_at = null
  where id = lesson_id
    and status in ('open', 'scheduled')
  returning student_id into target_student_id;

  if not found then raise exception 'Lesson cannot be cancelled'; end if;
  if target_student_id is not null then
    insert into public.notifications (
      recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
    )
    values (
      target_student_id, 'student', 'Урок отменён',
      'Администратор отменил урок. Откройте календарь, чтобы выбрать другое окно.',
      'lesson', '/dashboard/student', now() + interval '5 minutes'
    );
  end if;
end;
$$;

revoke all on function public.admin_cancel_lesson(uuid) from public;
grant execute on function public.admin_cancel_lesson(uuid) to authenticated;

create or replace function public.admin_cancel_student_lessons(
  target_student_id uuid,
  period_start timestamptz,
  period_end timestamptz
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cancelled_count integer;
  from_text text;
  to_text text;
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;
  if period_start is null or period_end is null then
    raise exception 'Period is required';
  end if;
  if period_end < period_start then
    raise exception 'Period end must be after start';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = target_student_id and role = 'student'
  ) then
    raise exception 'Student was not found';
  end if;

  update public.lessons
  set
    status = 'cancelled',
    cancel_request = 'none',
    cancel_note = null,
    reschedule_request = 'none',
    preferred_reschedule_at = null,
    reschedule_note = null,
    reschedule_requested_at = null
  where student_id = target_student_id
    and status = 'scheduled'
    and datetime >= period_start
    and datetime <= period_end;

  get diagnostics cancelled_count = row_count;

  if cancelled_count = 0 then
    raise exception 'No scheduled lessons in this period';
  end if;

  from_text := to_char(period_start at time zone 'Europe/Moscow', 'DD.MM.YYYY');
  to_text := to_char(period_end at time zone 'Europe/Moscow', 'DD.MM.YYYY');

  insert into public.notifications (
    recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
  )
  values (
    target_student_id,
    'student',
    'Занятия отменены',
    'Администратор отменил '
      || cancelled_count::text
      || ' '
      || case
           when cancelled_count % 10 = 1 and cancelled_count % 100 <> 11 then 'занятие'
           when cancelled_count % 10 between 2 and 4
            and cancelled_count % 100 not between 12 and 14 then 'занятия'
           else 'занятий'
         end
      || ' с '
      || from_text
      || ' по '
      || to_text
      || '.',
    'lesson',
    '/dashboard/student',
    now() + interval '5 minutes'
  );

  return cancelled_count;
end;
$$;

revoke all on function public.admin_cancel_student_lessons(uuid, timestamptz, timestamptz) from public;
grant execute on function public.admin_cancel_student_lessons(uuid, timestamptz, timestamptz) to authenticated;
