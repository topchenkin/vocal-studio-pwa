-- Redeem gift on signup; never expose admin note on student profiles.

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

  -- Admin note stays only on gift_certificates.note
  update public.profiles
  set
    gift_certificate_id = cert.id,
    gift_kind = cert.kind,
    gift_note = null,
    gift_buyer_name = cert.buyer_name
  where id = target_id;
end;
$$;

-- Internal helper (not granted to clients).
create or replace function public.redeem_gift_certificate_for_user(
  p_user_id uuid,
  p_code text,
  p_full_name text default null
)
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
  if p_user_id is null then
    raise exception 'Нужен пользователь';
  end if;

  compact := upper(regexp_replace(coalesce(p_code, ''), '[^a-zA-Z0-9]', '', 'g'));
  if length(compact) <> 12 then
    raise exception 'Код сертификата — 12 символов';
  end if;

  if coalesce(trim(p_full_name), '') <> '' then
    update public.profiles
    set full_name = trim(p_full_name)
    where id = p_user_id
      and (
        full_name is null
        or trim(full_name) = ''
        or public.norm_person_name(full_name) = public.norm_person_name(p_full_name)
      );
  end if;

  select * into cert
  from public.gift_certificates
  where code = compact
  for update;

  if not found then
    raise exception 'Сертификат не найден';
  end if;
  if cert.status = 'redeemed' then
    if cert.redeemed_by = p_user_id then
      return jsonb_build_object('ok', true, 'already', true, 'kind', cert.kind);
    end if;
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
  where id = p_user_id;

  if public.norm_person_name(profile_name)
     is distinct from public.norm_person_name(cert.recipient_name) then
    raise exception 'Имя в профиле не совпадает с именем на сертификате. Укажите то же имя, что написал даритель.';
  end if;

  if exists (
    select 1 from public.profiles
    where id = p_user_id
      and gift_certificate_id is not null
      and gift_certificate_id is distinct from cert.id
  ) then
    raise exception 'К этому аккаунту уже привязан сертификат';
  end if;

  if exists (
    select 1 from public.profiles
    where id = p_user_id and gift_certificate_id = cert.id
  ) then
    return jsonb_build_object('ok', true, 'already', true, 'kind', cert.kind);
  end if;

  perform public.apply_gift_certificate_to_profile(cert, p_user_id);

  update public.gift_certificates
  set status = 'redeemed',
      redeemed_by = p_user_id,
      redeemed_at = now()
  where id = cert.id;

  return jsonb_build_object('ok', true, 'already', false, 'kind', cert.kind);
end;
$$;

drop function if exists public.redeem_gift_certificate(text);
drop function if exists public.redeem_gift_certificate(text, text);

create or replace function public.redeem_gift_certificate(
  p_code text,
  p_full_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Нужно войти';
  end if;
  return public.redeem_gift_certificate_for_user(auth.uid(), p_code, p_full_name);
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  gift_code text;
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
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
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

  gift_code := nullif(
    upper(regexp_replace(coalesce(new.raw_user_meta_data ->> 'gift_code', ''), '[^a-zA-Z0-9]', '', 'g')),
    ''
  );

  if gift_code is not null and length(gift_code) = 12 then
    begin
      perform public.redeem_gift_certificate_for_user(
        new.id,
        gift_code,
        coalesce(new.raw_user_meta_data ->> 'full_name', '')
      );
    exception
      when others then
        raise warning 'gift redeem on signup failed for %: %', new.id, sqlerrm;
    end;
  end if;

  return new;
end;
$$;

update public.profiles
set gift_note = null
where gift_note is not null;

revoke all on function public.redeem_gift_certificate_for_user(uuid, text, text) from public;
revoke all on function public.redeem_gift_certificate_for_user(uuid, text, text) from authenticated;
revoke all on function public.redeem_gift_certificate_for_user(uuid, text, text) from anon;

revoke all on function public.redeem_gift_certificate(text, text) from public;
grant execute on function public.redeem_gift_certificate(text, text) to authenticated;
