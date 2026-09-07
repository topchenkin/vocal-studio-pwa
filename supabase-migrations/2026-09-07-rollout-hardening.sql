-- Restore reschedule reminder anti-dupe and format expiry dates in studio TZ.

create or replace function public.remind_pending_reschedules()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_count integer;
  oldest_when timestamptz;
  notify_message text;
  action_path text;
begin
  if auth.role() <> 'service_role' then
    return 0;
  end if;

  select count(*), min(datetime)
  into pending_count, oldest_when
  from public.lessons
  where reschedule_request = 'pending'
    and coalesce(reschedule_requested_at, datetime) <= now() - interval '1 hour';

  if coalesce(pending_count, 0) = 0 then
    return 0;
  end if;

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

  action_path :=
    '/dashboard/admin?tab=schedule&date='
    || to_char(oldest_when at time zone 'Asia/Yekaterinburg', 'YYYY-MM-DD');
  notify_message :=
    'Неподтверждённые переносы: '
    || pending_count::text
    || '. Откройте расписание — такие дни отмечены жёлтой точкой.';

  insert into public.notifications (
    recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
  )
  select
    p.id, 'admin', 'Неподтверждённые переносы', notify_message, 'lesson', action_path,
    now() + interval '5 minutes'
  from public.profiles p
  where p.role = 'admin';

  return pending_count;
end;
$$;

revoke all on function public.remind_pending_reschedules() from public;
grant execute on function public.remind_pending_reschedules() to service_role;

create or replace function public.remind_subscription_expiring()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  inserted integer := 0;
  end_label text;
begin
  for rec in
    select id, full_name, app_sub_tier, app_sub_expires_at
    from public.profiles
    where role = 'student'
      and app_sub_tier is distinct from 'none'
      and app_sub_expires_at is not null
      and app_sub_expires_at > now()
      and app_sub_expires_at <= now() + interval '3 days'
      and (
        app_sub_expiry_reminded_for is null
        or app_sub_expiry_reminded_for is distinct from app_sub_expires_at
      )
  loop
    end_label := to_char(
      rec.app_sub_expires_at at time zone 'Asia/Yekaterinburg',
      'DD.MM.YYYY'
    );

    insert into public.notifications (
      recipient_id,
      recipient_role,
      title,
      message,
      kind,
      action_url,
      email_fallback_at
    )
    values (
      rec.id,
      'student',
      'Подписка заканчивается',
      'Доступ к платформе действует до ' || end_label ||
        '. Оплатите продление через СБП в кабинете — автосписания нет.',
      'payment',
      '/dashboard/student/subscription',
      now() + interval '5 minutes'
    );

    update public.profiles
    set app_sub_expiry_reminded_for = rec.app_sub_expires_at
    where id = rec.id;

    inserted := inserted + 1;
  end loop;

  return inserted;
end;
$$;

revoke all on function public.remind_subscription_expiring() from public;
grant execute on function public.remind_subscription_expiring() to service_role;

notify pgrst, 'reload schema';
