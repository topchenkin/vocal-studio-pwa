-- Generalize payment confirmation for YooKassa + Robokassa.

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
  partner uuid;
  gift_id uuid;
  confirmed_provider text;
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

  confirmed_provider := coalesce(nullif(trim(p_provider), ''), tx.provider, 'robokassa');

  is_duo := coalesce((tx.metadata ->> 'is_duo')::boolean, false)
    or coalesce(tx.product_code, '') ilike '%duo%';
  product_tier := coalesce(
    tx.metadata ->> 'tier',
    replace(coalesce(tx.product_code, ''), '_duo', '')
  );
  gift_id := nullif(tx.metadata ->> 'gift_id', '')::uuid;

  if tx.purpose = 'lesson_debt' then
    update public.profiles
    set debt_amount = 0
    where id = tx.student_id;
  elsif tx.purpose = 'app_subscription' then
    if product_tier not in ('standard', 'premium', 'vip') then
      raise exception 'Invalid subscription tier';
    end if;
    if is_duo then
      update public.profiles
      set app_sub_tier = product_tier,
          app_sub_variant = 'duo_owner'
      where id = tx.student_id and role = 'student';
      if not found then raise exception 'Student profile was not found'; end if;

      insert into public.duo_subscriptions (owner_id, tier, status)
      values (tx.student_id, product_tier, 'awaiting_partner')
      on conflict (owner_id) do update
      set tier = excluded.tier,
          status = case
            when duo_subscriptions.partner_id is null then 'awaiting_partner'
            else 'active'
          end,
          cancelled_at = null;

      select partner_id into partner
      from public.duo_subscriptions
      where owner_id = tx.student_id;

      if partner is not null then
        update public.profiles
        set app_sub_tier = product_tier,
            app_sub_variant = 'duo_member'
        where id = partner;
      end if;
    else
      if exists (
        select 1 from public.profiles
        where id = tx.student_id and app_sub_variant = 'duo_member'
      ) then
        raise exception 'Duo member subscription is managed by its owner';
      end if;
      update public.profiles
      set app_sub_tier = product_tier
      where id = tx.student_id and role = 'student';
      if not found then raise exception 'Student profile was not found'; end if;
    end if;
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
  else
    raise exception 'Unsupported payment purpose';
  end if;

  update public.payment_transactions
  set
    status = 'confirmed',
    provider = confirmed_provider,
    external_id = coalesce(nullif(p_external_id, ''), external_id),
    confirmed_at = now(),
    metadata = metadata || jsonb_build_object('confirmed_via', confirmed_provider)
  where id = tx.id;

  return jsonb_build_object('ok', true, 'already', false, 'id', tx.id);
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
    'robokassa'
  );
end;
$$;

revoke all on function public.confirm_payment(integer, numeric, text, text) from public;
grant execute on function public.confirm_payment(integer, numeric, text, text) to service_role;

revoke all on function public.confirm_robokassa_payment(integer, numeric, text) from public;
grant execute on function public.confirm_robokassa_payment(integer, numeric, text) to service_role;
