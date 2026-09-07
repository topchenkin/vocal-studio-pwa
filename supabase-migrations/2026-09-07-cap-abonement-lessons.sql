-- Abonement pack is always 8 lessons at profile.custom_abonement_price.
-- Do not honor client metadata.lessons_count (payment amount does not scale).

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
  lessons_add := 8;
  lesson_id := nullif(tx.metadata ->> 'lesson_id', '')::uuid;

  if tx.purpose = 'lesson_debt' then
    update public.profiles
    set debt_amount = greatest(debt_amount - tx.amount_rub, 0)
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

notify pgrst, 'reload schema';
