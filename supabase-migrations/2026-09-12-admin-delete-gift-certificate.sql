-- Admin-only hard-delete for unused gift certificates (not redeemed).
-- Idempotent: safe to re-apply. Does not change create/redeem RPCs.

drop policy if exists "gift_admin_manage" on public.gift_certificates;
create policy "gift_admin_manage"
on public.gift_certificates for all
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "gift_student_read_own" on public.gift_certificates;
create policy "gift_student_read_own"
on public.gift_certificates for select
using (redeemed_by = auth.uid());

create or replace function public.admin_delete_gift_certificate(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cert public.gift_certificates;
  deleted_n integer;
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

  if cert.status = 'redeemed' or cert.redeemed_by is not null then
    raise exception 'Сертификат нельзя удалить — уже активирован';
  end if;

  -- Dangling profile pointers from a failed apply; never wipe a real redemption
  -- (those rows are blocked above).
  update public.profiles
  set
    gift_certificate_id = null,
    gift_kind = null,
    gift_buyer_name = null
  where gift_certificate_id = p_id;

  delete from public.gift_certificates
  where id = p_id
    and redeemed_by is null
    and status <> 'redeemed';

  get diagnostics deleted_n = row_count;
  if deleted_n < 1 then
    raise exception 'Сертификат нельзя удалить — уже активирован или не найден';
  end if;
end;
$$;

revoke all on function public.admin_delete_gift_certificate(uuid) from public;
revoke all on function public.admin_delete_gift_certificate(uuid) from anon;
grant execute on function public.admin_delete_gift_certificate(uuid) to authenticated;
