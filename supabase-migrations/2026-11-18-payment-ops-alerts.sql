-- Pay-api logs payment/lesson mismatches into client_events and notifies admins.
-- service_role only: browser log_client_event still requires auth.uid().

create or replace function public.log_ops_event(
  p_user_id uuid,
  p_name text,
  p_path text default '',
  p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_path text;
  v_detail jsonb := '{}'::jsonb;
  v_key text;
  v_val jsonb;
  v_url text;
  v_label text;
  v_who text;
  v_invoice text;
begin
  v_name := left(trim(both from coalesce(p_name, '')), 80);
  if v_name = '' then
    return;
  end if;

  v_path := left(split_part(trim(both from coalesce(p_path, '')), '?', 1), 120);
  if v_path !~ '^/' then
    v_path := '/pay';
  end if;

  if jsonb_typeof(coalesce(p_detail, 'null'::jsonb)) = 'object' then
    for v_key, v_val in
      select key, value from jsonb_each(p_detail)
    loop
      if v_key !~ '^[a-zA-Z0-9_]{1,32}$' then
        continue;
      end if;
      if jsonb_typeof(v_val) not in ('string', 'number', 'boolean', 'null') then
        continue;
      end if;
      if jsonb_typeof(v_val) = 'string' then
        v_val := to_jsonb(left(v_val #>> '{}', 180));
      end if;
      v_detail := v_detail || jsonb_build_object(v_key, v_val);
    end loop;
  end if;

  v_invoice := coalesce(v_detail ->> 'invoice', '');

  if p_user_id is not null then
    insert into public.client_events (
      user_id, kind, name, path, detail, release, ua
    ) values (
      p_user_id,
      'error',
      v_name,
      v_path,
      v_detail,
      'pay-api',
      'pay-api'
    );
  end if;

  v_label := case v_name
    when 'payment_mismatch' then 'оплата прошла, занятия не начислились'
    when 'payment_confirm' then 'оплата не начислила занятия'
    when 'payment_init' then 'не открылась оплата'
    else 'сбой оплаты'
  end;

  if p_user_id is not null then
    select coalesce(nullif(trim(full_name), ''), nullif(trim(email), ''), 'Ученик')
    into v_who
    from public.profiles
    where id = p_user_id;
  end if;

  v_url := '/dashboard/admin?tab=logs&event=' || v_name;
  if p_user_id is not null then
    v_url := v_url || '&student=' || p_user_id::text;
  end if;
  if v_invoice <> '' then
    v_url := v_url || '&invoice=' || left(v_invoice, 16);
  end if;

  if exists (
    select 1
    from public.notifications n
    where n.recipient_role = 'admin'
      and n.action_url = v_url
      and n.created_at > now() - interval '15 minutes'
  ) then
    return;
  end if;

  insert into public.notifications (
    recipient_id, recipient_role, title, message, kind, action_url
  )
  select
    p.id,
    'admin',
    'Ошибка оплаты',
    coalesce(v_who, 'Оплата')
      || ': '
      || v_label
      || case
        when v_invoice <> '' then ' (счёт ' || v_invoice || ')'
        else ''
      end,
    'general',
    v_url
  from public.profiles p
  where p.role = 'admin'
    and p.deleted_at is null;
end;
$$;

revoke all on function public.log_ops_event(uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.log_ops_event(uuid, text, text, jsonb)
  to service_role;

notify pgrst, 'reload schema';
