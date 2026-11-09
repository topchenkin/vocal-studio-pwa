-- Diagnostic cabinet journal for support (152-FZ: contract + security).
-- Screens, named taps, connection faults, client errors. No session replay,
-- no field values, no signed-URL tokens. Rows expire after 30 days.

create table if not exists public.client_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('screen', 'action', 'error', 'connect')),
  name text not null,
  path text not null default '',
  detail jsonb not null default '{}'::jsonb,
  release text not null default '',
  ua text not null default ''
);

create index if not exists client_events_user_created_idx
  on public.client_events (user_id, created_at desc);

create index if not exists client_events_created_idx
  on public.client_events (created_at desc);

alter table public.client_events enable row level security;

drop policy if exists "client_events_admin_read" on public.client_events;
create policy "client_events_admin_read"
on public.client_events for select
to authenticated
using (public.current_user_is_admin());

revoke all on table public.client_events from public, anon;
grant select on table public.client_events to authenticated;

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
begin
  if v_uid is null then
    return;
  end if;

  v_kind := lower(trim(both from coalesce(p_kind, '')));
  if v_kind not in ('screen', 'action', 'error', 'connect') then
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
    left(trim(both from coalesce(p_release, '')), 16),
    left(trim(both from coalesce(p_ua, '')), 180)
  );

  delete from public.client_events
  where user_id = v_uid
    and created_at < now() - interval '30 days';

  if random() < 0.02 then
    delete from public.client_events
    where created_at < now() - interval '30 days';
  end if;
end;
$$;

revoke all on function public.log_client_event(text, text, text, jsonb, text, text)
  from public, anon;
grant execute on function public.log_client_event(text, text, text, jsonb, text, text)
  to authenticated;

notify pgrst, 'reload schema';
