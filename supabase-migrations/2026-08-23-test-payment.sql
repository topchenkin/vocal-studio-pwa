-- Allow 1 RUB live YooKassa test payments that confirm without entitlements.

alter table public.payment_transactions
  drop constraint if exists payment_transactions_purpose_check;

alter table public.payment_transactions
  add constraint payment_transactions_purpose_check
  check (
    purpose in (
      'lesson_debt',
      'lesson_package',
      'app_subscription',
      'gift_certificate',
      'test_payment'
    )
  );

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
    -- Real 1 RUB live check via YooKassa; no entitlement changes.
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

notify pgrst, 'reload schema';
