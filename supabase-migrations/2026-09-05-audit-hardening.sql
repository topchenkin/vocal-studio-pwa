-- Close unpaid-access holes, lock Free chat, harden lesson money, Ekb TZ.

create or replace function public.current_user_has_app_sub()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and (
        role = 'admin'
        or (
          app_sub_tier is not null
          and app_sub_tier <> 'none'
          and (app_sub_expires_at is null or app_sub_expires_at > now())
        )
      )
  );
$$;

revoke all on function public.current_user_has_app_sub() from public;
grant execute on function public.current_user_has_app_sub() to authenticated;

drop policy if exists "chat_messages_send_participants" on public.chat_messages;
create policy "chat_messages_send_participants"
on public.chat_messages for insert
with check (
  sender_id = auth.uid()
  and (
    public.current_user_is_admin()
    or (
      student_id = auth.uid()
      and public.current_user_has_app_sub()
    )
  )
);

drop policy if exists "group_chat_messages_send" on public.group_chat_messages;
create policy "group_chat_messages_send"
on public.group_chat_messages for insert
with check (
  sender_id = auth.uid()
  and public.user_is_group_chat_member(group_id)
  and (
    public.current_user_is_admin()
    or public.current_user_has_app_sub()
  )
);

revoke all on function public.upgrade_app_subscription(text) from public;
revoke all on function public.upgrade_app_subscription(text) from authenticated;
grant execute on function public.upgrade_app_subscription(text) to service_role;

revoke all on function public.settle_student_debt() from public;
revoke all on function public.settle_student_debt() from authenticated;
grant execute on function public.settle_student_debt() to service_role;

revoke all on function public.upgrade_duo_subscription(text) from public;
revoke all on function public.upgrade_duo_subscription(text) from authenticated;
grant execute on function public.upgrade_duo_subscription(text) to service_role;

revoke all on function public.complete_sandbox_payment(text, numeric, text, boolean) from public;
revoke all on function public.complete_sandbox_payment(text, numeric, text, boolean) from authenticated;

revoke all on function public.book_lesson_slot(uuid) from public;
revoke all on function public.book_lesson_slot(uuid) from authenticated;

create or replace function public.update_own_profile(
  p_full_name text default null,
  p_phone text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  update public.profiles
  set
    full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
    phone = coalesce(nullif(trim(p_phone), ''), phone)
  where id = auth.uid();
  if not found then
    raise exception 'Profile was not found';
  end if;
end;
$$;

revoke all on function public.update_own_profile(text, text) from public;
grant execute on function public.update_own_profile(text, text) to authenticated;

drop policy if exists "exercises_authenticated_read" on public.exercises;
create policy "exercises_authenticated_read"
on public.exercises for select
to authenticated
using (
  public.current_user_is_admin()
  or public.user_can_access_exercise(id, auth.uid())
);

drop policy if exists "exercise_phrases_student_read" on public.exercise_phrases;
create policy "exercise_phrases_student_read"
on public.exercise_phrases for select
to authenticated
using (
  public.current_user_is_admin()
  or public.user_can_access_exercise(exercise_id, auth.uid())
);

update public.ai_tool_access
set min_tier = 'premium', updated_at = now()
where tool_id in ('vocalfx', 'chordloop', 'mixer', 'pitchshift', 'timbre');

update public.ai_tool_access
set min_tier = 'none', updated_at = now()
where tool_id = 'tuner';

update public.subscription_products
set features = '["ИИ-анализатор нот","Чат с преподавателем","Часть упражнений"]'
where code = 'standard';

update public.subscription_products
set features = '["Всё из Standard","Больше упражнений","Обработка голоса и аккорды"]'
where code = 'premium';

update public.subscription_products
set features = '["Всё из Premium","Запись студийного трека"]'
where code = 'vip';

create or replace function public.complete_lesson(lesson_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_student_id uuid;
  target_pay_type text;
  target_lesson_price numeric(10, 2);
  target_paid_at timestamptz;
  target_when timestamptz;
  target_reschedule text;
  target_cancel text;
  target_balance integer;
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;

  select student_id, paid_at, datetime, reschedule_request, cancel_request
  into target_student_id, target_paid_at, target_when, target_reschedule, target_cancel
  from public.lessons
  where id = lesson_id and status = 'scheduled'
  for update;

  if target_student_id is null then
    raise exception 'Scheduled lesson with a student was not found';
  end if;

  if target_when > now() then
    raise exception 'Cannot complete a future lesson';
  end if;

  if target_reschedule = 'pending' or target_cancel = 'pending' then
    raise exception 'Resolve the pending request first';
  end if;

  select lesson_pay_type, custom_lesson_price, lessons_balance
  into target_pay_type, target_lesson_price, target_balance
  from public.profiles
  where id = target_student_id
  for update;

  if target_pay_type = 'abonement' then
    if coalesce(target_balance, 0) > 0 then
      update public.profiles
      set lessons_balance = greatest(lessons_balance - 1, 0)
      where id = target_student_id;
    else
      update public.profiles
      set debt_amount = debt_amount + coalesce(target_lesson_price, 0)
      where id = target_student_id;
    end if;
  elsif target_paid_at is null then
    update public.profiles
    set debt_amount = debt_amount + coalesce(target_lesson_price, 0)
    where id = target_student_id;
  end if;

  update public.lessons
  set status = 'completed'
  where id = lesson_id;
end;
$$;

revoke all on function public.complete_lesson(uuid) from public;
grant execute on function public.complete_lesson(uuid) to authenticated;

-- Cron path inlines the charge: complete_lesson is admin-only.
create or replace function public.auto_complete_started_lessons()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  les record;
  target_pay_type text;
  target_lesson_price numeric(10, 2);
  target_paid_at timestamptz;
  target_balance integer;
  closed integer := 0;
begin
  if auth.role() <> 'service_role' then
    return 0;
  end if;

  for les in
    select id, student_id, paid_at
    from public.lessons
    where status = 'scheduled'
      and student_id is not null
      and datetime + interval '1 hour' <= now()
      and coalesce(reschedule_request, 'none') <> 'pending'
      and coalesce(cancel_request, 'none') <> 'pending'
    order by datetime
    for update skip locked
  loop
    select lesson_pay_type, custom_lesson_price, lessons_balance
    into target_pay_type, target_lesson_price, target_balance
    from public.profiles
    where id = les.student_id
    for update;

    if target_pay_type = 'abonement' then
      if coalesce(target_balance, 0) > 0 then
        update public.profiles
        set lessons_balance = greatest(lessons_balance - 1, 0)
        where id = les.student_id;
      else
        update public.profiles
        set debt_amount = debt_amount + coalesce(target_lesson_price, 0)
        where id = les.student_id;
      end if;
    elsif les.paid_at is null then
      update public.profiles
      set debt_amount = debt_amount + coalesce(target_lesson_price, 0)
      where id = les.student_id;
    end if;

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

create or replace function public.withdraw_lesson_request(lesson_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.lessons
  set
    reschedule_request = 'none',
    preferred_reschedule_at = null,
    reschedule_note = null,
    reschedule_requested_at = null,
    cancel_request = 'none',
    cancel_note = null
  where id = lesson_id
    and student_id = auth.uid()
    and status = 'scheduled'
    and (
      reschedule_request = 'pending'
      or cancel_request = 'pending'
    );

  if not found then
    raise exception 'No pending request to withdraw';
  end if;
end;
$$;

revoke all on function public.withdraw_lesson_request(uuid) from public;
grant execute on function public.withdraw_lesson_request(uuid) to authenticated;

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
    cancel_note = note_clean,
    reschedule_request = 'none',
    preferred_reschedule_at = null,
    reschedule_note = null,
    reschedule_requested_at = null
  where id = lesson_id
    and student_id = auth.uid()
    and status = 'scheduled'
    and cancel_request in ('none', 'rejected')
  returning datetime into current_when;

  if not found then
    raise exception 'Lesson is not available for a cancel request';
  end if;

  select coalesce(nullif(trim(full_name), ''), nullif(trim(email), ''), 'Ученик')
  into student_name
  from public.profiles
  where id = auth.uid();

  student_name := coalesce(student_name, 'Ученик');
  notify_message :=
    student_name
    || ' запросил(а) отмену урока. Сейчас: '
    || to_char(current_when at time zone 'Asia/Yekaterinburg', 'DD.MM.YYYY HH24:MI');

  if note_clean is not null then
    notify_message := notify_message || '. Комментарий: ' || note_clean;
  end if;

  action_path :=
    '/dashboard/admin?tab=schedule&lesson='
    || lesson_id::text
    || '&date='
    || to_char(current_when at time zone 'Asia/Yekaterinburg', 'YYYY-MM-DD');

  insert into public.notifications (
    recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
  )
  select
    p.id, 'admin', 'Запрос отмены урока', notify_message, 'lesson', action_path,
    now() + interval '5 minutes'
  from public.profiles p
  where p.role = 'admin';
end;
$$;

create or replace function public.charge_late_cancel(target_lesson_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_student_id uuid;
  target_when timestamptz;
  target_pay_type text;
  target_lesson_price numeric(10, 2);
  target_paid_at timestamptz;
  target_balance integer;
begin
  select student_id, datetime, paid_at
  into target_student_id, target_when, target_paid_at
  from public.lessons
  where id = target_lesson_id;

  if target_student_id is null then
    return;
  end if;
  if target_when - now() >= interval '24 hours' then
    return;
  end if;

  select lesson_pay_type, custom_lesson_price, lessons_balance
  into target_pay_type, target_lesson_price, target_balance
  from public.profiles
  where id = target_student_id
  for update;

  if target_pay_type = 'abonement' then
    if coalesce(target_balance, 0) > 0 then
      update public.profiles
      set lessons_balance = greatest(lessons_balance - 1, 0)
      where id = target_student_id;
    else
      update public.profiles
      set debt_amount = debt_amount + coalesce(target_lesson_price, 0)
      where id = target_student_id;
    end if;
  elsif target_paid_at is null then
    update public.profiles
    set debt_amount = debt_amount + coalesce(target_lesson_price, 0)
    where id = target_student_id;
  end if;
end;
$$;

revoke all on function public.charge_late_cancel(uuid) from public;
revoke all on function public.charge_late_cancel(uuid) from authenticated;

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
    perform public.charge_late_cancel(lesson_id);

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
        target_student_id, 'student', 'Урок отменён',
        'Администратор подтвердил отмену урока '
          || to_char(current_when at time zone 'Asia/Yekaterinburg', 'DD.MM.YYYY HH24:MI')
          || '.',
        'lesson', '/dashboard/student?tab=lessons', now() + interval '5 minutes'
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
        target_student_id, 'student', 'Отмена отклонена',
        'Администратор отклонил запрос на отмену. Напишите в чат, если нужна помощь.',
        'lesson', '/dashboard/student?tab=lessons', now() + interval '5 minutes'
      );
    end if;
  end if;
end;
$$;

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
  notify_message text;
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;

  if approve then
    if new_datetime is null then
      raise exception 'New datetime is required';
    end if;
    update public.lessons
    set
      datetime = new_datetime,
      reschedule_request = 'none',
      preferred_reschedule_at = null,
      reschedule_note = null,
      reschedule_requested_at = null
    where id = lesson_id
      and reschedule_request = 'pending'
    returning student_id into target_student_id;
    notify_message :=
      'Урок перенесён на '
      || to_char(new_datetime at time zone 'Asia/Yekaterinburg', 'DD.MM.YYYY HH24:MI');
  else
    update public.lessons
    set
      reschedule_request = 'rejected',
      preferred_reschedule_at = null,
      reschedule_note = null,
      reschedule_requested_at = null
    where id = lesson_id
      and reschedule_request = 'pending'
    returning student_id into target_student_id;
    notify_message := 'Администратор отклонил запрос на перенос. Напишите в чат, если нужна помощь.';
  end if;

  if not found then
    raise exception 'Reschedule request was not found';
  end if;

  if target_student_id is not null then
    insert into public.notifications (
      recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
    )
    values (
      target_student_id, 'student',
      case when approve then 'Урок перенесён' else 'Перенос отклонён' end,
      notify_message, 'lesson', '/dashboard/student?tab=lessons',
      now() + interval '5 minutes'
    );
  end if;
end;
$$;

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
  preferred_text text;
  note_clean text;
  action_path text;
begin
  note_clean := nullif(left(trim(coalesce(student_note, '')), 200), '');

  update public.lessons
  set
    reschedule_request = 'pending',
    preferred_reschedule_at = preferred_at,
    reschedule_note = note_clean,
    reschedule_requested_at = now(),
    cancel_request = 'none',
    cancel_note = null
  where id = lesson_id
    and student_id = auth.uid()
    and status = 'scheduled'
    and reschedule_request in ('none', 'rejected')
  returning datetime into current_when;

  if not found then
    raise exception 'Lesson is not available for a reschedule request';
  end if;

  select coalesce(nullif(trim(full_name), ''), nullif(trim(email), ''), 'Ученик')
  into student_name
  from public.profiles
  where id = auth.uid();

  student_name := coalesce(student_name, 'Ученик');
  notify_message :=
    student_name
    || ' запросил(а) перенос урока. Сейчас: '
    || to_char(current_when at time zone 'Asia/Yekaterinburg', 'DD.MM.YYYY HH24:MI');

  if preferred_at is not null then
    preferred_text := to_char(preferred_at at time zone 'Asia/Yekaterinburg', 'DD.MM.YYYY HH24:MI');
    notify_message := notify_message || '. Желаемое время: ' || preferred_text;
  end if;
  if note_clean is not null then
    notify_message := notify_message || '. Комментарий: ' || note_clean;
  end if;

  action_path :=
    '/dashboard/admin?tab=schedule&lesson='
    || lesson_id::text
    || '&date='
    || to_char(current_when at time zone 'Asia/Yekaterinburg', 'YYYY-MM-DD');

  insert into public.notifications (
    recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
  )
  select
    p.id, 'admin', 'Запрос переноса урока', notify_message, 'lesson', action_path,
    now() + interval '5 minutes'
  from public.profiles p
  where p.role = 'admin';
end;
$$;

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

create or replace function public.notify_student_on_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  purpose_label text;
  amount_label text;
begin
  if new.status is distinct from 'confirmed' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'confirmed' then
    return new;
  end if;
  if new.student_id is null then
    return new;
  end if;

  purpose_label := case new.purpose
    when 'lesson_debt' then 'задолженность за занятия'
    when 'lesson_package' then 'пакет занятий'
    when 'lesson_one_time' then 'занятие'
    when 'app_subscription' then 'подписку'
    when 'test_payment' then 'тестовую оплату'
    else 'оплату'
  end;
  amount_label := trim(to_char(new.amount_rub, 'FM999999990.00')) || ' ₽';

  insert into public.notifications (
    recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
  )
  values (
    new.student_id,
    'student',
    'Оплата получена',
    'Счёт №'
      || new.invoice_no::text
      || ': '
      || purpose_label
      || ', '
      || amount_label
      || '. Это подтверждение оплаты. Кассовый чек 54-ФЗ самозанятый оформляет отдельно в «Мой налог».',
    'payment',
    '/dashboard/student?tab=lessons',
    now() + interval '2 minutes'
  );

  return new;
end;
$$;

drop trigger if exists notify_student_on_payment on public.payment_transactions;
create trigger notify_student_on_payment
after insert or update of status on public.payment_transactions
for each row execute procedure public.notify_student_on_payment();

notify pgrst, 'reload schema';
