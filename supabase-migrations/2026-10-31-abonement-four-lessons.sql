-- Abonement pack is always 4 lessons at profile.custom_abonement_price.
-- Keep in sync with lib/constants.ts ABONEMENT_LESSONS and pay-api.
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
  lessons_add := 4;
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

-- Unpaid completed abonement lesson accrues 1/4 of the pack price.
-- Cancelled lessons never reach this function.
create or replace function public.apply_lesson_completion_charge(
  p_student_id uuid,
  p_paid_at timestamptz,
  p_allow_debt boolean
)
returns void
language plpgsql
as $$
declare
  target_pay_type text;
  target_lesson_price numeric(10, 2);
  target_abonement_price numeric(10, 2);
  target_balance integer;
  pack_slice numeric(10, 2);
begin
  select lesson_pay_type, custom_lesson_price, custom_abonement_price, lessons_balance
  into target_pay_type, target_lesson_price, target_abonement_price, target_balance
  from public.profiles
  where id = p_student_id
  for update;

  if target_pay_type = 'abonement' then
    if coalesce(target_balance, 0) > 0 then
      update public.profiles
      set lessons_balance = greatest(lessons_balance - 1, 0)
      where id = p_student_id;
    else
      pack_slice := round(coalesce(target_abonement_price, 0) / 4.0, 2);
      if pack_slice > 0 then
        update public.profiles
        set debt_amount = debt_amount + pack_slice
        where id = p_student_id;
      end if;
    end if;
  elsif p_paid_at is null and p_allow_debt then
    update public.profiles
    set debt_amount = debt_amount + coalesce(target_lesson_price, 0)
    where id = p_student_id;
  end if;
end;
$$;

revoke all on function public.apply_lesson_completion_charge(uuid, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.apply_lesson_completion_charge(uuid, timestamptz, boolean)
  to service_role;

notify pgrst, 'reload schema';
