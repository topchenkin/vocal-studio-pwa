-- Abonement is never billed per leftover lesson. A completed lesson with
-- zero remaining lessons opens an unpaid pack: full pack price to debt,
-- then this lesson consumes 1 of the 4.

create or replace function public.apply_lesson_completion_charge(
  p_student_id uuid,
  p_paid_at timestamptz,
  p_allow_debt boolean
)
returns void
language plpgsql
as $$
declare
  target_pay_type text;
  target_lesson_price numeric(10, 2);
  target_abonement_price numeric(10, 2);
  target_balance integer;
  pack_price numeric(10, 2);
begin
  select lesson_pay_type, custom_lesson_price, custom_abonement_price, lessons_balance
  into target_pay_type, target_lesson_price, target_abonement_price, target_balance
  from public.profiles
  where id = p_student_id
  for update;

  if target_pay_type = 'abonement' then
    if coalesce(target_balance, 0) > 0 then
      update public.profiles
      set lessons_balance = greatest(lessons_balance - 1, 0)
      where id = p_student_id;
    else
      pack_price := coalesce(target_abonement_price, 0);
      if pack_price > 0 then
        update public.profiles
        set debt_amount = debt_amount + pack_price,
            lessons_balance = 4 - 1
        where id = p_student_id;
      end if;
    end if;
  elsif p_paid_at is null and p_allow_debt then
    update public.profiles
    set debt_amount = debt_amount + coalesce(target_lesson_price, 0)
    where id = p_student_id;
  end if;
end;
$$;

revoke all on function public.apply_lesson_completion_charge(uuid, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.apply_lesson_completion_charge(uuid, timestamptz, boolean)
  to service_role;

notify pgrst, 'reload schema';
