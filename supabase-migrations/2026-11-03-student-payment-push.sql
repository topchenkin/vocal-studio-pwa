-- Student payment push: short success copy. Admin notify is unchanged.

create or replace function public.notify_student_on_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  purpose_label text;
  amount_label text;
begin
  if new.status is distinct from 'confirmed' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'confirmed' then
    return new;
  end if;
  if new.student_id is null then
    return new;
  end if;

  purpose_label := case new.purpose
    when 'lesson_debt' then 'задолженность за занятия'
    when 'lesson_package' then 'пакет занятий'
    when 'lesson_one_time' then 'занятие'
    when 'app_subscription' then 'подписку'
    when 'test_payment' then 'тестовую оплату'
    else 'оплату'
  end;
  amount_label := trim(to_char(new.amount_rub, 'FM999999990.00')) || ' ₽';

  insert into public.notifications (
    recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
  )
  values (
    new.student_id,
    'student',
    'Оплата прошла успешно',
    purpose_label || ' — ' || amount_label || '.',
    'payment',
    '/dashboard/student?tab=lessons',
    now() + interval '2 minutes'
  );

  return new;
end;
$$;

notify pgrst, 'reload schema';
