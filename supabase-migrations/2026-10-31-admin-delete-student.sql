-- Soft-delete a student from the CRM. Chat rows stay (profiles FK is ON DELETE
-- CASCADE, so the profile row must remain). Idempotent.

alter table public.profiles
  add column if not exists deleted_at timestamptz;

create index if not exists profiles_deleted_at_idx
  on public.profiles (deleted_at)
  where deleted_at is null;

create or replace function public.admin_delete_student(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.profiles%rowtype;
begin
  if not public.current_user_is_admin() then
    raise exception 'Только администратор';
  end if;

  if p_id = auth.uid() then
    raise exception 'Нельзя удалить свой аккаунт';
  end if;

  select * into target
  from public.profiles
  where id = p_id
  for update;

  if not found then
    raise exception 'Ученик не найден';
  end if;

  if target.role <> 'student' then
    raise exception 'Можно удалить только ученика';
  end if;

  if target.deleted_at is not null then
    return;
  end if;

  -- Partner of this owner goes back to the previous individual tier.
  update public.profiles as partner
  set
    app_sub_tier = coalesce(duo.partner_previous_tier, 'none'),
    app_sub_variant = coalesce(duo.partner_previous_variant, 'individual')
  from public.duo_subscriptions as duo
  where duo.owner_id = p_id
    and duo.partner_id = partner.id;

  update public.duo_subscriptions
  set
    status = 'cancelled',
    cancelled_at = coalesce(cancelled_at, now()),
    partner_id = null
  where owner_id = p_id;

  -- This student was someone's Duo partner.
  update public.duo_subscriptions
  set
    partner_id = null,
    status = case
      when status = 'cancelled' then status
      else 'awaiting_partner'
    end,
    linked_at = null
  where partner_id = p_id;

  delete from public.student_folder_members
  where student_id = p_id;

  delete from public.exercise_student_access
  where student_id = p_id;

  delete from public.push_subscriptions
  where user_id = p_id;

  update public.lessons
  set
    status = 'cancelled',
    cancel_request = 'none',
    cancel_note = null,
    reschedule_request = 'none',
    preferred_reschedule_at = null,
    reschedule_note = null,
    reschedule_requested_at = null
  where student_id = p_id
    and status = 'scheduled'
    and datetime >= now();

  update public.profiles
  set
    deleted_at = now(),
    is_active_student = false,
    app_sub_tier = 'none',
    app_sub_variant = 'individual',
    app_sub_expires_at = null,
    lessons_balance = 0,
    gift_certificate_id = null,
    gift_kind = null,
    gift_note = null,
    gift_buyer_name = null
  where id = p_id;
end;
$$;

revoke all on function public.admin_delete_student(uuid) from public;
revoke all on function public.admin_delete_student(uuid) from anon;
grant execute on function public.admin_delete_student(uuid) to authenticated;
