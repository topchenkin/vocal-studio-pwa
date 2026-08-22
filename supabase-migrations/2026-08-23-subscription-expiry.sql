-- Subscription end date, multi-month confirm, expiry reminders, abonement packages.

alter table public.profiles
  add column if not exists app_sub_expires_at timestamptz;

alter table public.profiles
  add column if not exists app_sub_expiry_reminded_for timestamptz;

comment on column public.profiles.app_sub_expires_at is
  'When the paid app subscription ends. Null = no dated subscription.';
comment on column public.profiles.app_sub_expiry_reminded_for is
  'Expiry timestamp for which the 3-day reminder was already sent.';

create or replace function public.extend_app_subscription(
  p_student_id uuid,
  p_tier text,
  p_is_duo boolean,
  p_months integer
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  months integer := greatest(coalesce(p_months, 1), 1);
  base_at timestamptz;
  new_end timestamptz;
  partner uuid;
begin
  if p_tier not in ('standard', 'premium', 'vip') then
    raise exception 'Invalid subscription tier';
  end if;

  select greatest(now(), coalesce(app_sub_expires_at, now()))
  into base_at
  from public.profiles
  where id = p_student_id
  for update;

  if not found then
    raise exception 'Student profile was not found';
  end if;

  new_end := base_at + make_interval(months => months);

  if p_is_duo then
    update public.profiles
    set app_sub_tier = p_tier,
        app_sub_variant = 'duo_owner',
        app_sub_expires_at = new_end,
        app_sub_expiry_reminded_for = null
    where id = p_student_id and role = 'student';
    if not found then raise exception 'Student profile was not found'; end if;

    insert into public.duo_subscriptions (owner_id, tier, status)
    values (p_student_id, p_tier, 'awaiting_partner')
    on conflict (owner_id) do update
    set tier = excluded.tier,
        status = case
          when duo_subscriptions.partner_id is null then 'awaiting_partner'
          else 'active'
        end,
        cancelled_at = null;

    select partner_id into partner
    from public.duo_subscriptions
    where owner_id = p_student_id;

    if partner is not null then
      update public.profiles
      set app_sub_tier = p_tier,
          app_sub_variant = 'duo_member',
          app_sub_expires_at = new_end,
          app_sub_expiry_reminded_for = null
      where id = partner;
    end if;
  else
    if exists (
      select 1 from public.profiles
      where id = p_student_id and app_sub_variant = 'duo_member'
    ) then
      raise exception 'Duo member subscription is managed by its owner';
    end if;

    update public.profiles
    set app_sub_tier = p_tier,
        app_sub_variant = case
          when app_sub_variant = 'duo_owner' then 'individual'
          else app_sub_variant
        end,
        app_sub_expires_at = new_end,
        app_sub_expiry_reminded_for = null
    where id = p_student_id and role = 'student';
    if not found then raise exception 'Student profile was not found'; end if;
  end if;

  return new_end;
end;
$$;

revoke all on function public.extend_app_subscription(uuid, text, boolean, integer) from public;
grant execute on function public.extend_app_subscription(uuid, text, boolean, integer) to service_role;

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

create or replace function public.confirm_robokassa_payment(
  p_invoice_no integer,
  p_out_sum numeric,
  p_external_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.confirm_payment(
    p_invoice_no,
    p_out_sum,
    p_external_id,
    'yookassa'
  );
end;
$$;

revoke all on function public.confirm_payment(integer, numeric, text, text) from public;
grant execute on function public.confirm_payment(integer, numeric, text, text) to service_role;

revoke all on function public.confirm_robokassa_payment(integer, numeric, text) from public;
grant execute on function public.confirm_robokassa_payment(integer, numeric, text) to service_role;

-- Gift redeem: extend subscription end when gift includes a tier.
create or replace function public.apply_gift_certificate_to_profile(
  cert public.gift_certificates,
  target_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rank_now integer;
  rank_gift integer;
  base_at timestamptz;
  new_end timestamptz;
begin
  if cert.kind in ('lesson', 'abonement', 'premium') then
    update public.profiles
    set
      lesson_pay_type = case
        when cert.kind = 'lesson' and lesson_pay_type = 'abonement' then lesson_pay_type
        when cert.kind = 'lesson' then 'one_time'
        else 'abonement'
      end,
      lessons_balance = lessons_balance + coalesce(cert.lessons_count, 0),
      custom_lesson_price = case
        when cert.kind = 'lesson' and custom_lesson_price = 0 then cert.amount_rub
        else custom_lesson_price
      end,
      custom_abonement_price = case
        when cert.kind in ('abonement', 'premium') then cert.amount_rub
        else custom_abonement_price
      end
    where id = target_id;
  end if;

  if cert.kind in ('subscription', 'premium') and cert.app_sub_tier is not null then
    rank_now := case (select app_sub_tier from public.profiles where id = target_id)
      when 'vip' then 3 when 'premium' then 2 when 'standard' then 1 else 0 end;
    rank_gift := case cert.app_sub_tier
      when 'vip' then 3 when 'premium' then 2 when 'standard' then 1 else 0 end;
    if rank_gift >= rank_now then
      select greatest(now(), coalesce(app_sub_expires_at, now()))
      into base_at
      from public.profiles
      where id = target_id;
      new_end := base_at + interval '1 month';
      update public.profiles
      set app_sub_tier = cert.app_sub_tier,
          app_sub_variant = case
            when app_sub_variant = 'duo_member' then app_sub_variant
            else 'individual'
          end,
          app_sub_expires_at = new_end,
          app_sub_expiry_reminded_for = null
      where id = target_id;
    end if;
  end if;

  update public.profiles
  set
    gift_certificate_id = cert.id,
    gift_kind = cert.kind,
    gift_note = null,
    gift_buyer_name = cert.buyer_name
  where id = target_id;
end;
$$;

-- Reminder 3 days before subscription end (push-api polls this).
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
      rec.app_sub_expires_at at time zone 'Europe/Moscow',
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

-- Drop expired tiers (idempotent soft expiry for access checks).
create or replace function public.expire_app_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.profiles
  set app_sub_tier = 'none',
      app_sub_variant = case
        when app_sub_variant = 'duo_member' then 'individual'
        when app_sub_variant = 'duo_owner' then 'individual'
        else app_sub_variant
      end
  where role = 'student'
    and app_sub_tier is distinct from 'none'
    and app_sub_expires_at is not null
    and app_sub_expires_at < now();

  get diagnostics n = row_count;
  return coalesce(n, 0);
end;
$$;

revoke all on function public.expire_app_subscriptions() from public;
grant execute on function public.expire_app_subscriptions() to service_role;

notify pgrst, 'reload schema';
