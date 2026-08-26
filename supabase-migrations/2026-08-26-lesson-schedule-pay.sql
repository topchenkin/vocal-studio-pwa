-- Per-lesson / abonement pay from the student schedule. Safe to re-run.

alter table public.lessons
  add column if not exists paid_at timestamptz,
  add column if not exists unpaid_notified_at timestamptz;

alter table public.payment_transactions
  drop constraint if exists payment_transactions_purpose_check;

alter table public.payment_transactions
  add constraint payment_transactions_purpose_check
  check (
    purpose in (
      'lesson_debt',
      'lesson_package',
      'lesson_one_time',
      'app_subscription',
      'gift_certificate',
      'test_payment'
    )
  );

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
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;

  select student_id, paid_at
  into target_student_id, target_paid_at
  from public.lessons
  where id = lesson_id and status = 'scheduled'
  for update;

  if target_student_id is null then
    raise exception 'Scheduled lesson with a student was not found';
  end if;

  select lesson_pay_type, custom_lesson_price
  into target_pay_type, target_lesson_price
  from public.profiles
  where id = target_student_id
  for update;

  if target_pay_type = 'abonement' then
    update public.profiles
    set lessons_balance = greatest(lessons_balance - 1, 0)
    where id = target_student_id;
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

create or replace function public.confirm_payment(
  p_invoice_no integer,
  p_out_sum numeric,
  p_external_id text default null,
  p_provider text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tx public.payment_transactions%rowtype;
  product_tier text;
  is_duo boolean;
  gift_id uuid;
  confirmed_provider text;
  months integer;
  lessons_add integer;
  new_end timestamptz;
  lesson_id uuid;
  lesson_status text;
begin
  if p_invoice_no is null or p_invoice_no <= 0 then
    raise exception 'Invalid invoice';
  end if;

  select * into tx
  from public.payment_transactions
  where invoice_no = p_invoice_no
  for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  if abs(tx.amount_rub - p_out_sum) > 0.009 then
    raise exception 'Amount mismatch';
  end if;

  if tx.status = 'confirmed' then
    return jsonb_build_object('ok', true, 'already', true, 'id', tx.id);
  end if;

  if tx.status <> 'pending' then
    raise exception 'Invoice is not pending';
  end if;

  confirmed_provider := coalesce(nullif(trim(p_provider), ''), tx.provider, 'yookassa');

  is_duo := coalesce((tx.metadata ->> 'is_duo')::boolean, false)
    or coalesce(tx.product_code, '') ilike '%duo%';
  product_tier := coalesce(
    tx.metadata ->> 'tier',
    replace(coalesce(tx.product_code, ''), '_duo', '')
  );
  gift_id := nullif(tx.metadata ->> 'gift_id', '')::uuid;
  months := greatest(coalesce(nullif(tx.metadata ->> 'months', '')::integer, 1), 1);
  lessons_add := greatest(
    coalesce(nullif(tx.metadata ->> 'lessons_count', '')::integer, 8),
    1
  );
  lesson_id := nullif(tx.metadata ->> 'lesson_id', '')::uuid;

  if tx.purpose = 'lesson_debt' then
    update public.profiles
    set debt_amount = 0
    where id = tx.student_id;
  elsif tx.purpose = 'lesson_package' then
    update public.profiles
    set
      lesson_pay_type = 'abonement',
      lessons_balance = lessons_balance + lessons_add,
      custom_abonement_price = case
        when custom_abonement_price > 0 then custom_abonement_price
        else tx.amount_rub
      end
    where id = tx.student_id and role = 'student';
    if not found then raise exception 'Student profile was not found'; end if;
  elsif tx.purpose = 'lesson_one_time' then
    if lesson_id is null then
      raise exception 'Lesson was not specified';
    end if;
    update public.lessons
    set paid_at = coalesce(paid_at, now())
    where id = lesson_id
      and student_id = tx.student_id
    returning status into lesson_status;
    if not found then
      raise exception 'Lesson was not found';
    end if;
    if lesson_status = 'completed' then
      update public.profiles
      set debt_amount = greatest(debt_amount - tx.amount_rub, 0)
      where id = tx.student_id;
    end if;
  elsif tx.purpose = 'app_subscription' then
    new_end := public.extend_app_subscription(
      tx.student_id,
      product_tier,
      is_duo,
      months
    );
  elsif tx.purpose = 'gift_certificate' then
    update public.gift_certificates
    set
      status = 'paid',
      paid_at = now(),
      expires_at = now() + interval '12 months',
      payment_id = tx.id,
      invoice_no = tx.invoice_no
    where id = coalesce(gift_id, (
      select id from public.gift_certificates where payment_id = tx.id limit 1
    ))
      and status in ('pending_payment', 'paid');
    if not found then
      raise exception 'Gift certificate was not found';
    end if;
  elsif tx.purpose = 'test_payment' then
    null;
  else
    raise exception 'Unsupported payment purpose';
  end if;

  update public.payment_transactions
  set
    status = 'confirmed',
    provider = confirmed_provider,
    external_id = coalesce(nullif(p_external_id, ''), external_id),
    confirmed_at = now(),
    metadata = metadata || jsonb_build_object(
      'confirmed_via', confirmed_provider,
      'app_sub_expires_at', new_end
    )
  where id = tx.id;

  return jsonb_build_object(
    'ok', true,
    'already', false,
    'id', tx.id,
    'app_sub_expires_at', new_end
  );
end;
$$;

revoke all on function public.confirm_payment(integer, numeric, text, text) from public;
grant execute on function public.confirm_payment(integer, numeric, text, text) to service_role;

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

  if new.purpose = 'gift_certificate' then
    student_name := coalesce(nullif(trim(new.metadata ->> 'recipient_name'), ''), 'Подарок');
    purpose_label := 'подарочный сертификат';
  else
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
      when 'lesson_one_time' then 'занятие'
      when 'app_subscription' then
        case
          when coalesce(new.product_code, '') ilike '%duo%' then 'подписку Duo'
          else 'подписку приложения'
        end
      when 'test_payment' then 'тестовую оплату'
      else 'оплату'
    end;
  end if;

  amount_label := trim(to_char(new.amount_rub, 'FM999999990')) || ' ₽';
  notify_message := student_name || ' — ' || purpose_label || ': ' || amount_label;

  insert into public.notifications (
    recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
  )
  select
    p.id,
    'admin',
    'Оплата',
    notify_message,
    'payment',
    case
      when new.purpose = 'gift_certificate' then '/dashboard/admin?tab=gifts'
      else '/dashboard/admin?tab=students'
    end,
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
      case
        when new.purpose = 'gift_certificate' then '/dashboard/admin?tab=gifts'
        else '/dashboard/admin?tab=students'
      end,
      now() + interval '5 minutes'
    );
  end if;

  return new;
end;
$$;

create or replace function public.notify_unpaid_ended_lessons()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  les record;
  sent integer := 0;
begin
  if auth.role() <> 'service_role' then
    return 0;
  end if;

  for les in
    select l.id, l.student_id
    from public.lessons l
    join public.profiles p on p.id = l.student_id
    where l.student_id is not null
      and p.role = 'student'
      and p.lesson_pay_type = 'one_time'
      and l.status in ('scheduled', 'completed')
      and l.paid_at is null
      and l.unpaid_notified_at is null
      and l.datetime + interval '1 hour' <= now()
      and l.datetime >= now() - interval '14 days'
    order by l.datetime
  loop
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
      les.student_id,
      'student',
      'Корм для котика',
      'Котик, урок прошёл, а корма котику так и нет. 😿',
      'payment',
      '/dashboard/student?tab=lessons',
      now() + interval '5 minutes'
    );

    update public.lessons
    set unpaid_notified_at = now()
    where id = les.id;

    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

revoke all on function public.notify_unpaid_ended_lessons() from public;
grant execute on function public.notify_unpaid_ended_lessons() to service_role;

notify pgrst, 'reload schema';
