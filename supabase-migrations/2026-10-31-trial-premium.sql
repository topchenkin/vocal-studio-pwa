-- Open-beta Premium through 10 Nov 2026 inclusive (studio TZ).
-- Does not touch paid/active Standard/Premium/VIP, duo, admins, or soft-deleted students.
-- Remover stays admin-only. Songwriter stays out of ai_tool_access.

do $$
declare
  trial_end timestamptz := timestamptz '2026-11-11 00:00:00+05';
begin
  update public.profiles
  set
    app_sub_tier = 'premium',
    app_sub_expires_at = trial_end
  where role = 'student'
    and deleted_at is null
    and coalesce(app_sub_variant, 'individual') = 'individual'
    and (
      coalesce(app_sub_tier, 'none') = 'none'
      or (
        app_sub_expires_at is not null
        and app_sub_expires_at <= now()
      )
    );
end $$;

update public.ai_tool_access
set
  enabled = true,
  min_tier = 'vip',
  title = 'Удаление вокала'
where tool_id = 'remover';

delete from public.ai_tool_access where tool_id = 'songwriter';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  gift_code text;
  trial_end timestamptz := timestamptz '2026-11-11 00:00:00+05';
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

  if now() < trial_end then
    update public.profiles
    set
      app_sub_tier = 'premium',
      app_sub_expires_at = trial_end
    where id = new.id
      and role = 'student'
      and deleted_at is null
      and coalesce(app_sub_variant, 'individual') = 'individual'
      and (
        coalesce(app_sub_tier, 'none') = 'none'
        or (
          app_sub_expires_at is not null
          and app_sub_expires_at <= now()
        )
      );
  end if;

  return new;
end;
$$;

select count(*) as trial_premium_students
from public.profiles
where role = 'student'
  and app_sub_tier = 'premium'
  and app_sub_expires_at = timestamptz '2026-11-11 00:00:00+05';
