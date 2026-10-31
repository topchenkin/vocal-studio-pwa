-- Open-beta Premium through 10 Nov 2026 inclusive.
-- Expire sweep must not leave testers on none; restore trial after wiping paid leftovers.

create or replace function public.current_user_can_use_feature(p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_is_admin()
    or exists (
      select 1
      from public.profiles as p
      left join public.ai_tool_access as a
        on a.tool_id = p_feature
      where p.id = auth.uid()
        and coalesce(a.enabled, true)
        and public.feature_tier_rank(
          case
            when (p.app_sub_expires_at is null or p.app_sub_expires_at > now())
                 and coalesce(p.app_sub_tier, 'none') is distinct from 'none'
              then coalesce(p.app_sub_tier, 'none')
            when now() < timestamptz '2026-11-11 00:00:00+05'
                 and coalesce(p.role, 'student') = 'student'
              then 'premium'
            else 'none'
          end
        ) >= public.feature_tier_rank(coalesce(a.min_tier, 'none'))
    );
$$;

revoke all on function public.current_user_can_use_feature(text) from public;
revoke all on function public.current_user_can_use_feature(text) from anon;
grant execute on function public.current_user_can_use_feature(text) to authenticated;

create or replace function public.expire_app_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  trial_end timestamptz := timestamptz '2026-11-11 00:00:00+05';
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

  if now() < trial_end then
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
  end if;

  return coalesce(n, 0);
end;
$$;

revoke all on function public.expire_app_subscriptions() from public;
revoke all on function public.expire_app_subscriptions() from anon;
grant execute on function public.expire_app_subscriptions() to service_role;
grant execute on function public.expire_app_subscriptions() to authenticated;

select public.expire_app_subscriptions();

notify pgrst, 'reload schema';
