-- Gift certificates: pay via SBP without a student account, redeem later by name + code.

alter table public.profiles
  add column if not exists phone text,
  add column if not exists gift_certificate_id uuid,
  add column if not exists gift_kind text,
  add column if not exists gift_note text,
  add column if not exists gift_buyer_name text;

alter table public.payment_transactions
  alter column student_id drop not null;

alter table public.payment_transactions
  drop constraint if exists payment_transactions_purpose_check;

alter table public.payment_transactions
  add constraint payment_transactions_purpose_check
  check (purpose in ('lesson_debt', 'lesson_package', 'app_subscription', 'gift_certificate'));

create table if not exists public.gift_certificates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  kind text not null
    check (kind in ('lesson', 'abonement', 'subscription', 'premium')),
  lessons_count integer,
  app_sub_tier text
    check (app_sub_tier is null or app_sub_tier in ('standard', 'premium', 'vip')),
  amount_rub numeric(10, 2) not null check (amount_rub > 0),
  recipient_name text not null,
  buyer_name text,
  note text not null default '',
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'paid', 'redeemed', 'cancelled')),
  payment_id uuid references public.payment_transactions(id) on delete set null,
  invoice_no integer,
  redeemed_by uuid references public.profiles(id) on delete set null,
  redeemed_at timestamptz,
  expires_at timestamptz,
  paid_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint gift_lessons_ok check (
    (kind = 'subscription' and lessons_count is null)
    or (kind = 'lesson' and lessons_count = 1)
    or (kind in ('abonement', 'premium') and lessons_count >= 1)
  ),
  constraint gift_tier_ok check (
    (kind in ('lesson', 'abonement') and app_sub_tier is null)
    or (kind in ('subscription', 'premium') and app_sub_tier is not null)
  )
);

create unique index if not exists gift_certificates_code_uidx
  on public.gift_certificates (code);

alter table public.gift_certificates enable row level security;

drop policy if exists "gift_admin_manage" on public.gift_certificates;
create policy "gift_admin_manage"
on public.gift_certificates for all
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "gift_student_read_own" on public.gift_certificates;
create policy "gift_student_read_own"
on public.gift_certificates for select
using (redeemed_by = auth.uid());

create or replace function public.norm_person_name(value text)
returns text
language sql
immutable
as $$
  select nullif(
    lower(replace(trim(regexp_replace(coalesce(value, ''), '\s+', ' ', 'g')), 'ё', 'е')),
    ''
  );
$$;

create or replace function public.generate_gift_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i integer;
  j integer;
begin
  for i in 1..24 loop
    candidate := '';
    for j in 1..12 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    if not exists (select 1 from public.gift_certificates where code = candidate) then
      return candidate;
    end if;
  end loop;
  raise exception 'Не удалось выдать уникальный код';
end;
$$;

create or replace function public.admin_create_gift_certificate(
  p_kind text,
  p_recipient_name text,
  p_note text,
  p_amount_rub numeric,
  p_lessons_count integer default null,
  p_app_sub_tier text default null,
  p_buyer_name text default null
)
returns public.gift_certificates
language plpgsql
security definer
set search_path = public
as $$
declare
  created public.gift_certificates;
  lessons integer;
  tier text;
begin
  if not public.current_user_is_admin() then
    raise exception 'Только администратор';
  end if;
  if p_kind not in ('lesson', 'abonement', 'subscription', 'premium') then
    raise exception 'Неизвестный тип сертификата';
  end if;
  if public.norm_person_name(p_recipient_name) is null then
    raise exception 'Укажите имя получателя — по нему сверяем активацию';
  end if;
  if coalesce(trim(p_note), '') = '' then
    raise exception 'Добавьте заметку: кто купил и зачем, чтобы не забыть при одобрении';
  end if;
  if p_amount_rub is null or p_amount_rub <= 0 then
    raise exception 'Укажите сумму';
  end if;

  if p_kind = 'lesson' then
    lessons := 1;
    tier := null;
  elsif p_kind = 'abonement' then
    lessons := p_lessons_count;
    tier := null;
    if lessons is null or lessons < 1 then
      raise exception 'Укажите количество занятий';
    end if;
  elsif p_kind = 'subscription' then
    lessons := null;
    tier := p_app_sub_tier;
    if tier not in ('standard', 'premium', 'vip') then
      raise exception 'Выберите тариф подписки';
    end if;
  else
    lessons := p_lessons_count;
    tier := p_app_sub_tier;
    if lessons is null or lessons < 1 then
      raise exception 'Укажите количество занятий';
    end if;
    if tier not in ('standard', 'premium', 'vip') then
      raise exception 'Выберите тариф подписки';
    end if;
  end if;

  insert into public.gift_certificates (
    code, kind, lessons_count, app_sub_tier, amount_rub,
    recipient_name, buyer_name, note, status, created_by
  )
  values (
    public.generate_gift_code(),
    p_kind,
    lessons,
    tier,
    p_amount_rub,
    trim(p_recipient_name),
    nullif(trim(coalesce(p_buyer_name, '')), ''),
    trim(p_note),
    'pending_payment',
    auth.uid()
  )
  returning * into created;

  return created;
end;
$$;

revoke all on function public.admin_create_gift_certificate(text, text, text, numeric, integer, text, text) from public;
grant execute on function public.admin_create_gift_certificate(text, text, text, numeric, integer, text, text) to authenticated;

create or replace function public.admin_cancel_gift_certificate(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'Только администратор';
  end if;
  update public.gift_certificates
  set status = 'cancelled'
  where id = p_id
    and status in ('pending_payment', 'paid')
    and redeemed_by is null;
  if not found then
    raise exception 'Сертификат нельзя отменить';
  end if;
end;
$$;

revoke all on function public.admin_cancel_gift_certificate(uuid) from public;
grant execute on function public.admin_cancel_gift_certificate(uuid) to authenticated;

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

  if cert.kind in ('subscription', 'premium') then
    rank_now := case (select app_sub_tier from public.profiles where id = target_id)
      when 'vip' then 3 when 'premium' then 2 when 'standard' then 1 else 0 end;
    rank_gift := case cert.app_sub_tier
      when 'vip' then 3 when 'premium' then 2 when 'standard' then 1 else 0 end;
    if rank_gift >= rank_now then
      update public.profiles
      set app_sub_tier = cert.app_sub_tier,
          app_sub_variant = case
            when app_sub_variant = 'duo_member' then app_sub_variant
            else 'individual'
          end
      where id = target_id;
    end if;
  end if;

  update public.profiles
  set
    gift_certificate_id = cert.id,
    gift_kind = cert.kind,
    gift_note = cert.note,
    gift_buyer_name = cert.buyer_name
  where id = target_id;
end;
$$;

create or replace function public.redeem_gift_certificate(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cert public.gift_certificates%rowtype;
  profile_name text;
  compact text;
begin
  if auth.uid() is null then
    raise exception 'Нужно войти';
  end if;

  compact := upper(regexp_replace(coalesce(p_code, ''), '[^a-zA-Z0-9]', '', 'g'));
  if length(compact) <> 12 then
    raise exception 'Код сертификата — 12 символов';
  end if;

  select * into cert
  from public.gift_certificates
  where code = compact
  for update;

  if not found then
    raise exception 'Сертификат не найден';
  end if;
  if cert.status = 'redeemed' then
    raise exception 'Этот сертификат уже активирован';
  end if;
  if cert.status = 'cancelled' then
    raise exception 'Сертификат отменён';
  end if;
  if cert.status <> 'paid' then
    raise exception 'Сначала нужна оплата сертификата';
  end if;
  if cert.expires_at is not null and cert.expires_at < now() then
    raise exception 'Срок сертификата истёк';
  end if;

  select full_name into profile_name
  from public.profiles
  where id = auth.uid();

  if public.norm_person_name(profile_name) is distinct from public.norm_person_name(cert.recipient_name) then
    raise exception 'Имя в профиле не совпадает с именем на сертификате. Укажите то же имя, что написал даритель.';
  end if;

  if exists (
    select 1 from public.profiles
    where id = auth.uid() and gift_certificate_id is not null
  ) then
    raise exception 'К этому аккаунту уже привязан сертификат';
  end if;

  perform public.apply_gift_certificate_to_profile(cert, auth.uid());

  update public.gift_certificates
  set status = 'redeemed',
      redeemed_by = auth.uid(),
      redeemed_at = now()
  where id = cert.id;

  return jsonb_build_object('ok', true, 'kind', cert.kind);
end;
$$;

revoke all on function public.redeem_gift_certificate(text) from public;
grant execute on function public.redeem_gift_certificate(text) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    phone,
    role,
    app_sub_tier,
    cat_level,
    is_active_student,
    lesson_pay_type,
    custom_lesson_price,
    custom_abonement_price,
    lessons_balance,
    debt_amount
  )
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), ''),
    case
      when lower(new.email) = 'iris.jar008@gmail.com' then 'admin'
      else 'student'
    end,
    'none',
    'beginner',
    false,
    'one_time',
    0,
    0,
    0,
    0
  )
  on conflict (id) do update
  set
    phone = coalesce(public.profiles.phone, excluded.phone),
    full_name = coalesce(public.profiles.full_name, excluded.full_name);

  return new;
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
declare
  tx public.payment_transactions%rowtype;
  product_tier text;
  is_duo boolean;
  partner uuid;
  gift_id uuid;
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
    provider = 'robokassa',
    external_id = coalesce(nullif(p_external_id, ''), external_id),
    confirmed_at = now(),
    metadata = metadata || jsonb_build_object('confirmed_via', 'robokassa')
  where id = tx.id;

  return jsonb_build_object('ok', true, 'already', false, 'id', tx.id);
end;
$$;

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
