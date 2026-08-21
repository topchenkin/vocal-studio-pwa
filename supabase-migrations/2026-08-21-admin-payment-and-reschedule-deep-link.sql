-- Admin push on any confirmed student payment, and deep-link reschedule
-- requests to the lesson day (or the lesson card in list view).

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

create or replace function public.notify_admin_on_student_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  student_name text;
  purpose_label text;
  amount_label text;
  notify_message text;
  inserted integer;
begin
  if new.status is distinct from 'confirmed' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'confirmed' then
    return new;
  end if;

  select coalesce(
    nullif(trim(full_name), ''),
    nullif(trim(email), ''),
    'Ученик'
  )
  into student_name
  from public.profiles
  where id = new.student_id;

  student_name := coalesce(student_name, 'Ученик');

  purpose_label := case new.purpose
    when 'lesson_debt' then 'задолженность за занятия'
    when 'lesson_package' then 'пакет занятий'
    when 'app_subscription' then
      case
        when coalesce(new.product_code, '') ilike '%duo%' then 'подписку Duo'
        else 'подписку приложения'
      end
    else 'оплату'
  end;

  amount_label := trim(to_char(new.amount_rub, 'FM999999990')) || ' ₽';
  notify_message := student_name || ' оплатил(а) ' || purpose_label || ': ' || amount_label;

  insert into public.notifications (
    recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
  )
  select
    p.id,
    'admin',
    'Оплата',
    notify_message,
    'payment',
    '/dashboard/admin?tab=students',
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
      'Оплата',
      notify_message,
      'payment',
      '/dashboard/admin?tab=students',
      now() + interval '5 minutes'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_student_payment_confirmed on public.payment_transactions;
create trigger on_student_payment_confirmed
after insert or update of status on public.payment_transactions
for each row
execute procedure public.notify_admin_on_student_payment();
