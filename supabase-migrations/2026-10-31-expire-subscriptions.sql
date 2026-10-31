-- Sweep expired app subscriptions so CRM shows «Без подписки».
-- Access checks already treat expires_at <= now() as none; this persists it.
-- Purchase end stays calendar months via extend_app_subscription (now + N months).

create or replace function public.expire_app_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.duo_subscriptions as d
  set status = 'cancelled',
      cancelled_at = coalesce(d.cancelled_at, now())
  from public.profiles as p
  where d.status is distinct from 'cancelled'
    and (d.owner_id = p.id or d.partner_id = p.id)
    and p.role = 'student'
    and p.app_sub_expires_at is not null
    and p.app_sub_expires_at <= now();

  update public.profiles
  set app_sub_tier = 'none',
      app_sub_variant = 'individual'
  where role = 'student'
    and app_sub_tier is distinct from 'none'
    and app_sub_expires_at is not null
    and app_sub_expires_at <= now();

  get diagnostics n = row_count;
  return coalesce(n, 0);
end;
$$;

revoke all on function public.expire_app_subscriptions() from public;
revoke all on function public.expire_app_subscriptions() from anon;
grant execute on function public.expire_app_subscriptions() to service_role;
grant execute on function public.expire_app_subscriptions() to authenticated;

notify pgrst, 'reload schema';
