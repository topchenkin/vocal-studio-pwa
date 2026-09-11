-- Admin-only archive for redeemed gift certificates.
-- Hides them from the default cabinet list without deleting payment history.

alter table public.gift_certificates
  add column if not exists archived_at timestamptz;

comment on column public.gift_certificates.archived_at is
  'When set, the certificate is hidden from the default admin list. Payments and redemption stay intact.';

create or replace function public.admin_set_gift_certificate_archived(
  p_id uuid,
  p_archived boolean
)
returns public.gift_certificates
language plpgsql
security definer
set search_path = public
as $$
declare
  cert public.gift_certificates;
begin
  if not public.current_user_is_admin() then
    raise exception 'Только администратор';
  end if;

  select * into cert
  from public.gift_certificates
  where id = p_id
  for update;

  if not found then
    raise exception 'Сертификат не найден';
  end if;

  if p_archived then
    if cert.status is distinct from 'redeemed' and cert.redeemed_by is null then
      raise exception 'В архив можно убрать только активированный сертификат';
    end if;
    update public.gift_certificates
    set archived_at = coalesce(archived_at, now())
    where id = p_id
    returning * into cert;
  else
    update public.gift_certificates
    set archived_at = null
    where id = p_id
    returning * into cert;
  end if;

  return cert;
end;
$$;

revoke all on function public.admin_set_gift_certificate_archived(uuid, boolean) from public;
revoke all on function public.admin_set_gift_certificate_archived(uuid, boolean) from anon;
grant execute on function public.admin_set_gift_certificate_archived(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
