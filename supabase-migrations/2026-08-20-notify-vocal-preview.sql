-- Short preview for vocal-test reports in the notification bell / push.
-- Safe to re-run.

alter table public.notifications
  add column if not exists push_sent_at timestamptz;

create or replace function public.chat_notification_preview(raw text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(raw, '') ~ '\{"v"\s*:\s*1'
      or coalesce(raw, '') like '%"overallScore"%'
      or coalesce(raw, '') like '%Отчёт вокалиста%'
      or coalesce(raw, '') like '%Отчет вокалиста%'
    then 'Отчет от ученика'
    else left(coalesce(raw, ''), 450)
  end;
$$;

create or replace function public.notify_chat_recipient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender_id = new.student_id then
    insert into public.notifications (
      recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
    )
    select
      profile.id,
      'admin',
      'Новое сообщение',
      new.sender_name || ': ' || public.chat_notification_preview(new.message),
      'chat',
      '/dashboard/admin?tab=chat',
      now() + interval '5 minutes'
    from public.profiles as profile
    where profile.role = 'admin';
  else
    insert into public.notifications (
      recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
    )
    values (
      new.student_id,
      'student',
      'Новое сообщение',
      new.sender_name || ': ' || public.chat_notification_preview(new.message),
      'chat',
      '/dashboard/student?tab=chat',
      now() + interval '5 minutes'
    );
  end if;

  return new;
end;
$$;

create or replace function public.notify_group_chat_recipient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  group_title text;
  preview text := public.chat_notification_preview(new.message);
begin
  select title into group_title from public.group_chats where id = new.group_id;

  insert into public.notifications (
    recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
  )
  select
    member.student_id,
    'student',
    coalesce(group_title, 'Групповой чат'),
    new.sender_name || ': ' || preview,
    'chat',
    '/dashboard/student?tab=chat&group=' || new.group_id::text,
    now() + interval '5 minutes'
  from public.group_chat_members member
  where member.group_id = new.group_id
    and member.student_id <> new.sender_id;

  if exists (
    select 1 from public.profiles where id = new.sender_id and role = 'student'
  ) then
    insert into public.notifications (
      recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
    )
    select
      profile.id,
      'admin',
      coalesce(group_title, 'Групповой чат'),
      new.sender_name || ': ' || preview,
      'chat',
      '/dashboard/admin?tab=chat&group=' || new.group_id::text,
      now() + interval '5 minutes'
    from public.profiles as profile
    where profile.role = 'admin';
  end if;

  return new;
end;
$$;
