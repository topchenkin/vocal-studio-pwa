-- Student reschedule request from the static GitHub Pages client (no Next.js API).
-- Run this script once in the Supabase SQL editor.

alter table public.lessons
  add column if not exists preferred_reschedule_at timestamptz,
  add column if not exists reschedule_note text;

drop function if exists public.request_lesson_reschedule(uuid);
drop function if exists public.request_lesson_reschedule(uuid, timestamptz);
drop function if exists public.request_lesson_reschedule(uuid, timestamptz, text);

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
begin
  note_clean := nullif(left(trim(coalesce(student_note, '')), 200), '');

  update public.lessons
  set
    reschedule_request = 'pending',
    preferred_reschedule_at = preferred_at,
    reschedule_note = note_clean
  where id = lesson_id
    and student_id = auth.uid()
    and status = 'scheduled'
    and reschedule_request in ('none', 'rejected')
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

  insert into public.notifications (
    recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
  )
  select
    p.id,
    'admin',
    'Запрос переноса урока',
    notify_message,
    'lesson',
    '/dashboard/admin?tab=schedule',
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
      '/dashboard/admin?tab=schedule',
      now() + interval '5 minutes'
    );
  end if;
end;
$$;

revoke all on function public.request_lesson_reschedule(uuid, timestamptz, text) from public;
grant execute on function public.request_lesson_reschedule(uuid, timestamptz, text) to authenticated;

create or replace function public.admin_resolve_reschedule(
  lesson_id uuid,
  approve boolean,
  new_datetime timestamptz default null
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
  if approve and new_datetime is null then
    raise exception 'New datetime is required';
  end if;

  update public.lessons
  set datetime = case when approve then new_datetime else datetime end,
      reschedule_request = case when approve then 'none' else 'rejected' end,
      preferred_reschedule_at = null,
      reschedule_note = null
  where id = lesson_id
    and reschedule_request = 'pending'
  returning student_id into target_student_id;

  if not found then raise exception 'Pending request was not found'; end if;

  insert into public.notifications (
    recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
  )
  values (
    target_student_id,
    'student',
    case when approve then 'Перенос подтверждён' else 'Перенос отклонён' end,
    case
      when approve then 'Урок перенесён на ' || to_char(new_datetime at time zone 'Europe/Moscow', 'DD.MM.YYYY HH24:MI')
      else 'Администратор отклонил запрос на перенос. Напишите в чат, если нужна помощь.'
    end,
    'lesson',
    '/dashboard/student',
    now() + interval '5 minutes'
  );
end;
$$;

revoke all on function public.admin_resolve_reschedule(uuid, boolean, timestamptz) from public;
grant execute on function public.admin_resolve_reschedule(uuid, boolean, timestamptz) to authenticated;
