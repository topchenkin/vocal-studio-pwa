-- Admin: mark gift paid manually (e.g. phone transfer) and hard-delete drafts.

create or replace function public.admin_mark_gift_certificate_paid(p_id uuid)
returns public.gift_certificates
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.gift_certificates;
begin
  if not public.current_user_is_admin() then
    raise exception 'Только администратор';
  end if;

  update public.gift_certificates
  set
    status = 'paid',
    paid_at = coalesce(paid_at, now()),
    expires_at = coalesce(expires_at, now() + interval '12 months')
  where id = p_id
    and status = 'pending_payment'
  returning * into updated;

  if not found then
    raise exception 'Сертификат не найден или уже оплачен';
  end if;

  return updated;
end;
$$;

create or replace function public.admin_delete_gift_certificate(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'Только администратор';
  end if;

  delete from public.gift_certificates
  where id = p_id
    and redeemed_by is null
    and status <> 'redeemed';

  if not found then
    raise exception 'Сертификат нельзя удалить — уже активирован или не найден';
  end if;
end;
$$;

revoke all on function public.admin_mark_gift_certificate_paid(uuid) from public;
grant execute on function public.admin_mark_gift_certificate_paid(uuid) to authenticated;

revoke all on function public.admin_delete_gift_certificate(uuid) from public;
grant execute on function public.admin_delete_gift_certificate(uuid) to authenticated;
