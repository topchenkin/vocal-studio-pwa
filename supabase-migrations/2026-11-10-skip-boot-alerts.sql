-- Boot errors are flushed after a successful cache-bust recover.
-- Keep them out of admin push; still store other student errors.

create or replace function public.log_client_event(
  p_kind text,
  p_name text,
  p_path text default '',
  p_detail jsonb default '{}'::jsonb,
  p_release text default '',
  p_ua text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_kind text;
  v_name text;
  v_path text;
  v_detail jsonb := '{}'::jsonb;
  v_key text;
  v_val jsonb;
  v_n int;
  v_url text;
  v_label text;
  v_who text;
  v_existing uuid;
  v_release text := left(trim(both from coalesce(p_release, '')), 16);
  v_ua text := left(trim(both from coalesce(p_ua, '')), 180);
begin
  if v_uid is null then
    return;
  end if;

  v_kind := lower(trim(both from coalesce(p_kind, '')));
  if v_kind = 'connect' then
    v_kind := 'error';
  end if;
  if v_kind not in ('login', 'error') then
    return;
  end if;

  v_name := left(trim(both from coalesce(p_name, '')), 80);
  if v_name = '' then
    return;
  end if;

  v_path := left(split_part(trim(both from coalesce(p_path, '')), '?', 1), 120);
  if v_path !~ '^/' then
    v_path := '';
  end if;
  if v_path like '/gate/%' then
    v_path := '/gate';
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

  if v_kind = 'login' then
    if exists (
      select 1 from public.profiles
      where id = v_uid
        and (
          role = 'admin'
          or lower(coalesce(email, '')) = 'yangta4@gmail.com'
        )
    ) then
      return;
    end if;

    v_detail := v_detail || jsonb_build_object('last_at', now());

    select e.id
    into v_existing
    from public.client_events e
    where e.user_id = v_uid
      and e.kind = 'login'
      and date_trunc('hour', timezone('Asia/Yekaterinburg', e.created_at))
        = date_trunc('hour', timezone('Asia/Yekaterinburg', now()))
    order by e.created_at
    limit 1;

    if v_existing is not null then
      update public.client_events
      set
        detail = coalesce(detail, '{}'::jsonb) || jsonb_build_object('last_at', now()),
        path = case when v_path <> '' then v_path else path end,
        ua = case when v_ua <> '' then v_ua else ua end
      where id = v_existing;
      return;
    end if;

    insert into public.client_events (
      user_id, kind, name, path, detail, release, ua
    ) values (
      v_uid,
      'login',
      v_name,
      v_path,
      v_detail,
      v_release,
      v_ua
    );

    delete from public.client_events
    where user_id = v_uid
      and created_at < now() - interval '30 days';
    return;
  end if;

  select count(*) into v_n
  from public.client_events
  where user_id = v_uid
    and created_at > now() - interval '1 minute';
  if v_n >= 40 then
    return;
  end if;

  insert into public.client_events (
    user_id, kind, name, path, detail, release, ua
  ) values (
    v_uid,
    v_kind,
    v_name,
    v_path,
    v_detail,
    v_release,
    v_ua
  );

  delete from public.client_events
  where user_id = v_uid
    and created_at < now() - interval '30 days';

  if random() < 0.02 then
    delete from public.client_events
    where created_at < now() - interval '30 days';
  end if;

  if v_name in ('resource', 'boot') then
    return;
  end if;

  if exists (
    select 1 from public.profiles
    where id = v_uid and role = 'admin'
  ) then
    return;
  end if;

  v_url := '/dashboard/admin?tab=logs&student=' || v_uid::text;
  if exists (
    select 1
    from public.notifications n
    where n.recipient_role = 'admin'
      and n.action_url = v_url
      and n.created_at > now() - interval '15 minutes'
  ) then
    return;
  end if;

  v_label := case v_name
    when 'mic' then 'не включился микрофон'
    when 'payment_init' then 'не открылась оплата'
    when 'sign_in' then 'не удалось войти'
    when 'fetch_fail' then 'нет связи с сервером'
    when 'backend_unreachable' then 'нет связи с сервером'
    when 'boot' then 'ошибка загрузки приложения'
    when 'window' then 'ошибка в приложении'
    when 'unhandled' then 'ошибка в приложении'
    else 'ошибка в приложении'
  end;

  select coalesce(nullif(trim(full_name), ''), nullif(trim(email), ''), 'Ученик')
  into v_who
  from public.profiles
  where id = v_uid;

  insert into public.notifications (
    recipient_id, recipient_role, title, message, kind, action_url
  )
  select
    p.id,
    'admin',
    'Ошибка в кабинете',
    coalesce(v_who, 'Ученик') || ': ' || v_label,
    'general',
    v_url
  from public.profiles p
  where p.role = 'admin'
    and p.deleted_at is null;
end;
$$;

notify pgrst, 'reload schema';
