-- Yellow-dot days are client-side. This tracks when a reschedule started
-- and reminds the admin if it stays unconfirmed.

alter table public.lessons
  add column if not exists reschedule_requested_at timestamptz;

create or replace function public.touch_reschedule_requested_at()
returns trigger
language plpgsql
as $$
begin
  if new.reschedule_request = 'pending'
     and old.reschedule_request is distinct from 'pending' then
    new.reschedule_requested_at := coalesce(new.reschedule_requested_at, now());
  elsif new.reschedule_request is distinct from 'pending' then
    new.reschedule_requested_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists on_lesson_reschedule_status on public.lessons;
create trigger on_lesson_reschedule_status
before update on public.lessons
for each row
execute procedure public.touch_reschedule_requested_at();

update public.lessons
set reschedule_requested_at = coalesce(reschedule_requested_at, now() - interval '2 hours')
where reschedule_request = 'pending'
  and reschedule_requested_at is null;

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
      reschedule_note = null,
      reschedule_requested_at = null
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

create or replace function public.remind_pending_reschedules()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_count integer;
  oldest_id uuid;
  oldest_when timestamptz;
  word text;
  notify_message text;
  action_path text;
  inserted integer := 0;
begin
  select count(*)
  into pending_count
  from public.lessons
  where reschedule_request = 'pending'
    and status = 'scheduled'
    and coalesce(reschedule_requested_at, datetime) <= now() - interval '1 hour';

  if coalesce(pending_count, 0) = 0 then
    return 0;
  end if;

  select id, datetime
  into oldest_id, oldest_when
  from public.lessons
  where reschedule_request = 'pending'
    and status = 'scheduled'
  order by coalesce(reschedule_requested_at, datetime)
  limit 1;

  if exists (
    select 1
    from public.notifications
    where recipient_role = 'admin'
      and kind = 'lesson'
      and title = 'Неподтверждённые переносы'
      and created_at > now() - interval '6 hours'
  ) then
    return 0;
  end if;

  word := case
    when pending_count % 10 = 1 and pending_count % 100 <> 11 then 'запрос'
    when pending_count % 10 between 2 and 4
      and (pending_count % 100 < 10 or pending_count % 100 >= 20) then 'запроса'
    else 'запросов'
  end;

  notify_message :=
    'Есть '
    || pending_count::text
    || ' неподтверждённых '
    || word
    || ' на перенос. Откройте расписание — такие дни отмечены жёлтой точкой.';

  if pending_count = 1 and oldest_id is not null then
    action_path :=
      '/dashboard/admin?tab=schedule&lesson='
      || oldest_id::text
      || '&date='
      || to_char(oldest_when at time zone 'Europe/Moscow', 'YYYY-MM-DD');
  else
    action_path := '/dashboard/admin?tab=schedule';
  end if;

  insert into public.notifications (
    recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
  )
  select
    p.id,
    'admin',
    'Неподтверждённые переносы',
    notify_message,
    'lesson',
    action_path,
    now() + interval '5 minutes'
  from public.profiles p
  where p.role = 'admin';

  get diagnostics inserted = row_count;
  if inserted = 0 then
    insert into public.notifications (
      recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
    )
    values (
      null,
      'admin',
      'Неподтверждённые переносы',
      notify_message,
      'lesson',
      action_path,
      now() + interval '5 minutes'
    );
    inserted := 1;
  end if;

  return inserted;
end;
$$;

revoke all on function public.remind_pending_reschedules() from public;
grant execute on function public.remind_pending_reschedules() to service_role;

notify pgrst, 'reload schema';
