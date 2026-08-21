-- Robokassa invoices use a numeric InvId. Confirm is service-role only.

alter table public.payment_transactions
  add column if not exists invoice_no integer;

create sequence if not exists public.payment_invoice_no_seq;

select setval(
  'public.payment_invoice_no_seq',
  greatest(
    coalesce((select max(invoice_no) from public.payment_transactions), 0),
    1000
  )
);

update public.payment_transactions
set invoice_no = nextval('public.payment_invoice_no_seq')
where invoice_no is null;

alter table public.payment_transactions
  alter column invoice_no set default nextval('public.payment_invoice_no_seq');

alter table public.payment_transactions
  alter column invoice_no set not null;

create unique index if not exists payment_transactions_invoice_no_uidx
  on public.payment_transactions (invoice_no);

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
declare
  tx public.payment_transactions%rowtype;
  product_tier text;
  is_duo boolean;
  partner uuid;
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

  is_duo := coalesce((tx.metadata ->> 'is_duo')::boolean, false)
    or coalesce(tx.product_code, '') ilike '%duo%';
  product_tier := coalesce(
    tx.metadata ->> 'tier',
    replace(coalesce(tx.product_code, ''), '_duo', '')
  );

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
  else
    raise exception 'Unsupported payment purpose';
  end if;

  update public.payment_transactions
  set
    status = 'confirmed',
    provider = 'robokassa',
    external_id = coalesce(nullif(p_external_id, ''), external_id),
    confirmed_at = now(),
    metadata = metadata || jsonb_build_object('confirmed_via', 'robokassa')
  where id = tx.id;

  return jsonb_build_object('ok', true, 'already', false, 'id', tx.id);
end;
$$;

revoke all on function public.confirm_robokassa_payment(integer, numeric, text) from public;
revoke all on function public.confirm_robokassa_payment(integer, numeric, text) from anon;
revoke all on function public.confirm_robokassa_payment(integer, numeric, text) from authenticated;
grant execute on function public.confirm_robokassa_payment(integer, numeric, text) to service_role;
grant usage, select on sequence public.payment_invoice_no_seq to service_role, postgres;
notify pgrst, 'reload schema';
