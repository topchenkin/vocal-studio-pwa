-- Run this script once in Supabase SQL Editor.
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'student' check (role in ('student', 'admin')),
  app_sub_tier text not null default 'none'
    check (app_sub_tier in ('none', 'standard', 'premium', 'vip')),
  cat_level text not null default 'beginner'
    check (cat_level in ('beginner', 'basic', 'pro', 'star')),
  is_active_student boolean not null default false,
  lesson_pay_type text not null default 'one_time'
    check (lesson_pay_type in ('abonement', 'one_time')),
  custom_lesson_price numeric(10, 2) not null default 0,
  custom_abonement_price numeric(10, 2) not null default 0,
  lessons_balance integer not null default 0,
  debt_amount numeric(10, 2) not null default 0
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.profiles(id) on delete set null,
  datetime timestamptz not null,
  status text not null default 'open'
    check (status in ('open', 'scheduled', 'completed', 'cancelled')),
  reschedule_request text not null default 'none'
    check (reschedule_request in ('none', 'pending', 'approved', 'rejected'))
);

-- Existing projects created with an earlier schema need free slots.
alter table public.lessons alter column student_id drop not null;
alter table public.lessons drop constraint if exists lessons_status_check;
alter table public.lessons
  add constraint lessons_status_check
  check (status in ('open', 'scheduled', 'completed', 'cancelled'));
alter table public.lessons alter column status set default 'open';
update public.lessons
set status = 'open'
where student_id is null and status = 'scheduled';

alter table public.lessons
  add column if not exists series_id uuid,
  add column if not exists is_recurring boolean not null default false,
  add column if not exists preferred_reschedule_at timestamptz,
  add column if not exists reschedule_note text;

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  media_url text not null,
  type text not null check (type in ('audio', 'video')),
  min_tier_required text not null default 'standard'
    check (min_tier_required in ('none', 'standard', 'premium', 'vip'))
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references public.profiles(id) on delete cascade,
  recipient_role text not null check (recipient_role in ('student', 'admin')),
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_name text not null,
  message text not null check (char_length(message) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.lessons enable row level security;
alter table public.exercises enable row level security;
alter table public.notifications enable row level security;
alter table public.chat_messages enable row level security;
alter table public.push_subscriptions enable row level security;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select
using (id = auth.uid() or public.current_user_is_admin());

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update"
on public.profiles for update
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "lessons_select_own_or_admin" on public.lessons;
create policy "lessons_select_own_or_admin"
on public.lessons for select
using (
  student_id = auth.uid()
  or (student_id is null and status = 'open')
  or public.current_user_is_admin()
);

drop policy if exists "lessons_request_reschedule" on public.lessons;
drop policy if exists "lessons_admin_update" on public.lessons;
create policy "lessons_admin_update"
on public.lessons for update
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "lessons_admin_insert" on public.lessons;
create policy "lessons_admin_insert"
on public.lessons for insert
with check (public.current_user_is_admin());

drop policy if exists "exercises_authenticated_read" on public.exercises;
create policy "exercises_authenticated_read"
on public.exercises for select
to authenticated
using (true);

drop policy if exists "exercises_admin_manage" on public.exercises;
create policy "exercises_admin_manage"
on public.exercises for all
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "notifications_read_own_or_admin" on public.notifications;
create policy "notifications_read_own_or_admin"
on public.notifications for select
using (
  recipient_id = auth.uid()
  or (recipient_role = 'admin' and public.current_user_is_admin())
);

drop policy if exists "notifications_admin_insert" on public.notifications;
create policy "notifications_admin_insert"
on public.notifications for insert
with check (
  public.current_user_is_admin()
  and recipient_role = 'student'
  and recipient_id is not null
);

drop policy if exists "notifications_mark_own_read" on public.notifications;
create policy "notifications_mark_own_read"
on public.notifications for update
using (
  recipient_id = auth.uid()
  or (recipient_role = 'admin' and public.current_user_is_admin())
)
with check (
  recipient_id = auth.uid()
  or (recipient_role = 'admin' and public.current_user_is_admin())
);

drop policy if exists "chat_messages_read_participants" on public.chat_messages;
create policy "chat_messages_read_participants"
on public.chat_messages for select
using (
  student_id = auth.uid()
  or public.current_user_is_admin()
);

drop policy if exists "chat_messages_send_participants" on public.chat_messages;
create policy "chat_messages_send_participants"
on public.chat_messages for insert
with check (
  sender_id = auth.uid()
  and (
    student_id = auth.uid()
    or public.current_user_is_admin()
  )
);

drop policy if exists "push_subscriptions_manage_own" on public.push_subscriptions;
create policy "push_subscriptions_manage_own"
on public.push_subscriptions for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

create or replace function public.register_push_subscription(
  subscription_endpoint text,
  subscription_p256dh text,
  subscription_auth text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  delete from public.push_subscriptions
  where endpoint = subscription_endpoint;

  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (
    subscription_endpoint,
    auth.uid(),
    subscription_p256dh,
    subscription_auth
  );
end;
$$;

revoke all on function public.register_push_subscription(text, text, text) from public;
grant execute on function public.register_push_subscription(text, text, text) to authenticated;

create or replace function public.notify_chat_recipient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender_id = new.student_id then
    insert into public.notifications (recipient_id, recipient_role, message)
    select
      profile.id,
      'admin',
      new.sender_name || ': ' || left(new.message, 450)
    from public.profiles as profile
    where profile.role = 'admin';
  else
    insert into public.notifications (recipient_id, recipient_role, message)
    values (
      new.student_id,
      'student',
      new.sender_name || ': ' || left(new.message, 450)
    );
  end if;

  return new;
end;
$$;

create table if not exists public.student_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.profiles(id) on delete cascade,
  homework text not null default '',
  teacher_comment text not null default '',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.student_notes enable row level security;

drop policy if exists "student_notes_read_own_or_admin" on public.student_notes;
create policy "student_notes_read_own_or_admin"
on public.student_notes for select
using (
  student_id = auth.uid()
  or public.current_user_is_admin()
);

drop policy if exists "student_notes_admin_manage" on public.student_notes;
create policy "student_notes_admin_manage"
on public.student_notes for all
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

create or replace function public.admin_resolve_reschedule(
  lesson_id uuid,
  approve boolean,
  new_datetime timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_student_id uuid;
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;
  if approve and new_datetime is null then
    raise exception 'New datetime is required';
  end if;

  update public.lessons
  set datetime = case when approve then new_datetime else datetime end,
      reschedule_request = case when approve then 'none' else 'rejected' end,
      preferred_reschedule_at = null,
      reschedule_note = null
  where id = lesson_id
    and reschedule_request = 'pending'
  returning student_id into target_student_id;

  if not found then raise exception 'Pending request was not found'; end if;

  insert into public.notifications (
    recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
  )
  values (
    target_student_id,
    'student',
    case when approve then 'Перенос подтверждён' else 'Перенос отклонён' end,
    case
      when approve then 'Урок перенесён на ' || to_char(new_datetime at time zone 'Europe/Moscow', 'DD.MM.YYYY HH24:MI')
      else 'Администратор отклонил запрос на перенос. Напишите в чат, если нужна помощь.'
    end,
    'lesson',
    '/dashboard/student',
    now() + interval '5 minutes'
  );
end;
$$;

revoke all on function public.admin_resolve_reschedule(uuid, boolean, timestamptz) from public;
grant execute on function public.admin_resolve_reschedule(uuid, boolean, timestamptz) to authenticated;

create or replace function public.admin_cancel_lesson(lesson_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_student_id uuid;
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;

  update public.lessons
  set status = 'cancelled'
  where id = lesson_id
    and status in ('open', 'scheduled')
  returning student_id into target_student_id;

  if not found then raise exception 'Lesson cannot be cancelled'; end if;
  if target_student_id is not null then
    insert into public.notifications (
      recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
    )
    values (
      target_student_id, 'student', 'Урок отменён',
      'Администратор отменил урок. Откройте календарь, чтобы выбрать другое окно.',
      'lesson', '/dashboard/student', now() + interval '5 minutes'
    );
  end if;
end;
$$;

revoke all on function public.admin_cancel_lesson(uuid) from public;
grant execute on function public.admin_cancel_lesson(uuid) to authenticated;

create or replace function public.admin_assign_lesson(
  lesson_id uuid,
  target_student_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = target_student_id and role = 'student'
  ) then raise exception 'Student was not found'; end if;

  update public.lessons
  set student_id = target_student_id,
      status = 'scheduled',
      reschedule_request = 'none'
  where id = lesson_id
    and status = 'open'
    and student_id is null;
  if not found then raise exception 'Open slot was not found'; end if;

  insert into public.notifications (
    recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
  )
  values (
    target_student_id, 'student', 'Новый урок',
    'Администратор записал вас на урок.',
    'lesson', '/dashboard/student', now() + interval '5 minutes'
  );
end;
$$;

revoke all on function public.admin_assign_lesson(uuid, uuid) from public;
grant execute on function public.admin_assign_lesson(uuid, uuid) to authenticated;

create or replace function public.complete_sandbox_payment(
  payment_purpose text,
  amount_rub numeric,
  new_tier text default null,
  is_duo boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  transaction_id uuid;
  product_code_value text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if amount_rub < 0 then raise exception 'Invalid amount'; end if;
  if payment_purpose not in ('lesson_debt', 'app_subscription') then
    raise exception 'Invalid payment purpose';
  end if;

  if payment_purpose = 'lesson_debt' then
    update public.profiles
    set debt_amount = 0
    where id = auth.uid();
  else
    if new_tier not in ('standard', 'premium', 'vip') then
      raise exception 'Invalid subscription tier';
    end if;
    if is_duo then
      perform public.upgrade_duo_subscription(new_tier);
      product_code_value := new_tier || '_duo';
    else
      if exists (
        select 1 from public.profiles
        where id = auth.uid() and app_sub_variant = 'duo_member'
      ) then raise exception 'Duo member subscription is managed by its owner'; end if;
      perform public.upgrade_app_subscription(new_tier);
      product_code_value := new_tier;
    end if;
  end if;

  insert into public.payment_transactions (
    student_id,
    product_code,
    purpose,
    amount_rub,
    provider,
    status,
    metadata,
    confirmed_at
  )
  values (
    auth.uid(),
    product_code_value,
    payment_purpose,
    amount_rub,
    'sandbox',
    'confirmed',
    jsonb_build_object(
      'sandbox', true,
      'notice', 'No money was charged and no bank webhook was received'
    ),
    now()
  )
  returning id into transaction_id;

  return transaction_id;
end;
$$;

revoke all on function public.complete_sandbox_payment(text, numeric, text, boolean) from public;
grant execute on function public.complete_sandbox_payment(text, numeric, text, boolean) to authenticated;

-- A student has exactly one lesson pricing model at a time.
update public.profiles
set custom_lesson_price = case
      when lesson_pay_type = 'one_time' then custom_lesson_price
      else 0
    end,
    custom_abonement_price = case
      when lesson_pay_type = 'abonement' then custom_abonement_price
      else 0
    end;

alter table public.profiles
  drop constraint if exists profiles_single_lesson_price_check;
alter table public.profiles
  add constraint profiles_single_lesson_price_check
  check (
    (lesson_pay_type = 'one_time' and custom_abonement_price = 0)
    or
    (lesson_pay_type = 'abonement' and custom_lesson_price = 0)
  );

drop trigger if exists on_chat_message_created on public.chat_messages;
create trigger on_chat_message_created
  after insert on public.chat_messages
  for each row execute procedure public.notify_chat_recipient();

-- Realtime delivers newly inserted notifications to an online PWA.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end
$$;

drop function if exists public.request_lesson_reschedule(uuid);
drop function if exists public.request_lesson_reschedule(uuid, timestamptz);
drop function if exists public.request_lesson_reschedule(uuid, timestamptz, text);

create or replace function public.request_lesson_reschedule(
  lesson_id uuid,
  preferred_at timestamptz default null,
  student_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_when timestamptz;
  student_name text;
  notify_message text;
  note_clean text;
  preferred_text text;
  action_path text;
begin
  note_clean := nullif(left(trim(coalesce(student_note, '')), 200), '');

  update public.lessons
  set
    reschedule_request = 'pending',
    preferred_reschedule_at = preferred_at,
    reschedule_note = note_clean
  where id = lesson_id
    and student_id = auth.uid()
    and status = 'scheduled'
    and reschedule_request in ('none', 'rejected')
  returning datetime into current_when;

  if not found then
    raise exception 'Lesson is not available for a reschedule request';
  end if;

  select coalesce(
    nullif(trim(full_name), ''),
    nullif(trim(email), ''),
    'Ученик'
  )
  into student_name
  from public.profiles
  where id = auth.uid();

  student_name := coalesce(student_name, 'Ученик');
  notify_message :=
    student_name
    || ' запросил(а) перенос урока. Сейчас: '
    || to_char(current_when at time zone 'Europe/Moscow', 'DD.MM.YYYY HH24:MI');

  if preferred_at is not null then
    preferred_text := to_char(preferred_at at time zone 'Europe/Moscow', 'DD.MM.YYYY HH24:MI');
    notify_message := notify_message || '. Желаемое время: ' || preferred_text;
  end if;

  if note_clean is not null then
    notify_message := notify_message || '. Комментарий: ' || note_clean;
  end if;

  action_path :=
    '/dashboard/admin?tab=schedule&lesson='
    || lesson_id::text
    || '&date='
    || to_char(current_when at time zone 'Europe/Moscow', 'YYYY-MM-DD');

  insert into public.notifications (
    recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
  )
  select
    p.id,
    'admin',
    'Запрос переноса урока',
    notify_message,
    'lesson',
    action_path,
    now() + interval '5 minutes'
  from public.profiles p
  where p.role = 'admin';

  if not found then
    insert into public.notifications (
      recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
    )
    values (
      null,
      'admin',
      'Запрос переноса урока',
      notify_message,
      'lesson',
      action_path,
      now() + interval '5 minutes'
    );
  end if;
end;
$$;

revoke all on function public.request_lesson_reschedule(uuid, timestamptz, text) from public;
grant execute on function public.request_lesson_reschedule(uuid, timestamptz, text) to authenticated;

create or replace function public.complete_lesson(lesson_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_student_id uuid;
  target_pay_type text;
  target_lesson_price numeric(10, 2);
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;

  select student_id
  into target_student_id
  from public.lessons
  where id = lesson_id and status = 'scheduled'
  for update;

  if target_student_id is null then
    raise exception 'Scheduled lesson with a student was not found';
  end if;

  select lesson_pay_type, custom_lesson_price
  into target_pay_type, target_lesson_price
  from public.profiles
  where id = target_student_id
  for update;

  if target_pay_type = 'abonement' then
    update public.profiles
    set lessons_balance = greatest(lessons_balance - 1, 0)
    where id = target_student_id;
  else
    update public.profiles
    set debt_amount = debt_amount + coalesce(target_lesson_price, 0)
    where id = target_student_id;
  end if;

  update public.lessons
  set status = 'completed'
  where id = lesson_id;
end;
$$;

revoke all on function public.complete_lesson(uuid) from public;
grant execute on function public.complete_lesson(uuid) to authenticated;

create or replace function public.book_lesson_slot(slot_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'student'
      and is_active_student = true
  ) then
    raise exception 'Only active students can book lessons';
  end if;

  update public.lessons
  set
    student_id = auth.uid(),
    status = 'scheduled',
    reschedule_request = 'none'
  where id = slot_id
    and status = 'open'
    and student_id is null;

  if not found then
    raise exception 'This slot is no longer available';
  end if;

  insert into public.notifications (recipient_role, message)
  values ('admin', 'Ученик записался на новый урок');
end;
$$;

revoke all on function public.book_lesson_slot(uuid) from public;
grant execute on function public.book_lesson_slot(uuid) to authenticated;

create or replace function public.settle_student_debt()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set debt_amount = 0
  where id = auth.uid() and role = 'student';

  if not found then
    raise exception 'Student profile was not found';
  end if;

  insert into public.notifications (recipient_role, message)
  values ('admin', 'Ученик оплатил задолженность по СБП');
end;
$$;

revoke all on function public.settle_student_debt() from public;
grant execute on function public.settle_student_debt() to authenticated;

create or replace function public.upgrade_app_subscription(new_tier text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if new_tier not in ('standard', 'premium', 'vip') then
    raise exception 'Invalid subscription tier';
  end if;

  update public.profiles
  set app_sub_tier = new_tier
  where id = auth.uid() and role = 'student';

  if not found then
    raise exception 'Student profile was not found';
  end if;

  insert into public.notifications (recipient_role, message)
  values ('admin', 'Ученик обновил тариф платформы до ' || new_tier);
end;
$$;

revoke all on function public.upgrade_app_subscription(text) from public;
grant execute on function public.upgrade_app_subscription(text) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    app_sub_tier,
    cat_level,
    is_active_student,
    lesson_pay_type,
    custom_lesson_price,
    custom_abonement_price,
    lessons_balance,
    debt_amount
  )
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    case
      when lower(new.email) = 'iris.jar008@gmail.com' then 'admin'
      else 'student'
    end,
    'none',
    'beginner',
    false,
    'one_time',
    0,
    0,
    0,
    0
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Backfill profiles for users registered before the trigger was installed.
insert into public.profiles as profiles (
  id,
  email,
  full_name,
  role,
  app_sub_tier,
  cat_level,
  is_active_student,
  lesson_pay_type,
  custom_lesson_price,
  custom_abonement_price,
  lessons_balance,
  debt_amount
)
select
  users.id,
  users.email,
  users.raw_user_meta_data ->> 'full_name',
  case
    when lower(users.email) = 'iris.jar008@gmail.com' then 'admin'
    else 'student'
  end,
  'none',
  'beginner',
  false,
  'one_time',
  0,
  0,
  0,
  0
from auth.users as users
on conflict (id) do update
set
  email = excluded.email,
  full_name = coalesce(excluded.full_name, profiles.full_name);

-- Promote the configured administrator when the auth account already exists.
update public.profiles
set role = 'admin'
where id in (
  select id
  from auth.users
  where lower(email) = 'iris.jar008@gmail.com'
);

-- ============================================================================
-- Configurable platform foundation: folders, Duo, content access and payments
-- ============================================================================

alter table public.profiles
  add column if not exists app_sub_variant text not null default 'individual';

alter table public.profiles
  drop constraint if exists profiles_app_sub_variant_check;
alter table public.profiles
  add constraint profiles_app_sub_variant_check
  check (app_sub_variant in ('individual', 'duo_owner', 'duo_member'));

alter table public.exercises
  add column if not exists min_cat_level text not null default 'beginner',
  add column if not exists active_students_only boolean not null default false,
  add column if not exists audience_mode text not null default 'rules',
  add column if not exists is_published boolean not null default true,
  add column if not exists storage_path text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

alter table public.exercises
  drop constraint if exists exercises_min_cat_level_check;
alter table public.exercises
  add constraint exercises_min_cat_level_check
  check (min_cat_level in ('beginner', 'basic', 'pro', 'star'));

alter table public.exercises
  drop constraint if exists exercises_audience_mode_check;
alter table public.exercises
  add constraint exercises_audience_mode_check
  check (audience_mode in ('rules', 'selected', 'rules_or_selected'));

alter table public.notifications
  add column if not exists title text,
  add column if not exists kind text not null default 'general',
  add column if not exists action_url text,
  add column if not exists read_at timestamptz,
  add column if not exists push_sent_at timestamptz,
  add column if not exists email_fallback_at timestamptz,
  add column if not exists email_sent_at timestamptz;

alter table public.notifications
  drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('general', 'chat', 'lesson', 'payment', 'content'));

create table if not exists public.student_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  description text,
  color text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.student_folder_members (
  folder_id uuid not null references public.student_folders(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (folder_id, student_id)
);

create table if not exists public.duo_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles(id) on delete cascade,
  partner_id uuid unique references public.profiles(id) on delete set null,
  tier text not null check (tier in ('standard', 'premium', 'vip')),
  status text not null default 'awaiting_partner'
    check (status in ('awaiting_partner', 'active', 'cancelled')),
  partner_previous_tier text
    check (partner_previous_tier is null or partner_previous_tier in ('none', 'standard', 'premium', 'vip')),
  partner_previous_variant text
    check (partner_previous_variant is null or partner_previous_variant in ('individual', 'duo_owner', 'duo_member')),
  linked_at timestamptz,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (owner_id is distinct from partner_id)
);

create table if not exists public.exercise_folder_access (
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  folder_id uuid not null references public.student_folders(id) on delete cascade,
  primary key (exercise_id, folder_id)
);

create table if not exists public.exercise_student_access (
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  effect text not null default 'allow' check (effect in ('allow', 'deny')),
  primary key (exercise_id, student_id)
);

create table if not exists public.subscription_products (
  code text primary key,
  title text not null,
  tier text not null check (tier in ('standard', 'premium', 'vip')),
  variant text not null check (variant in ('individual', 'duo_owner')),
  price_rub numeric(10, 2) not null check (price_rub >= 0),
  is_active boolean not null default true,
  features jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.subscription_products (code, title, tier, variant, price_rub, features)
values
  ('standard', 'Standard', 'standard', 'individual', 990, '["AI-анализатор нот","Чат","Базовые упражнения"]'),
  ('premium', 'Premium', 'premium', 'individual', 1990, '["Всё из Standard","AI-минусовки","Индивидуальные распевки"]'),
  ('vip', 'VIP', 'vip', 'individual', 3990, '["Всё из Premium","Безлимитный AI","Студийный трек"]'),
  ('standard_duo', 'Standard Duo', 'standard', 'duo_owner', 1490, '["Два аккаунта Standard"]'),
  ('premium_duo', 'Premium Duo', 'premium', 'duo_owner', 2990, '["Два аккаунта Premium"]'),
  ('vip_duo', 'VIP Duo', 'vip', 'duo_owner', 5990, '["Два аккаунта VIP"]')
on conflict (code) do nothing;

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  product_code text references public.subscription_products(code) on delete set null,
  purpose text not null
    check (purpose in ('lesson_debt', 'lesson_package', 'app_subscription')),
  amount_rub numeric(10, 2) not null check (amount_rub >= 0),
  provider text not null default 'sandbox',
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'failed', 'cancelled', 'refunded')),
  external_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

alter table public.student_folders enable row level security;
alter table public.student_folder_members enable row level security;
alter table public.duo_subscriptions enable row level security;
alter table public.exercise_folder_access enable row level security;
alter table public.exercise_student_access enable row level security;
alter table public.subscription_products enable row level security;
alter table public.payment_transactions enable row level security;

drop policy if exists "student_folders_admin_manage" on public.student_folders;
create policy "student_folders_admin_manage"
on public.student_folders for all
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "folder_members_admin_manage" on public.student_folder_members;
create policy "folder_members_admin_manage"
on public.student_folder_members for all
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "folder_members_read_own" on public.student_folder_members;
create policy "folder_members_read_own"
on public.student_folder_members for select
using (student_id = auth.uid());

drop policy if exists "duo_read_participants" on public.duo_subscriptions;
create policy "duo_read_participants"
on public.duo_subscriptions for select
using (
  owner_id = auth.uid()
  or partner_id = auth.uid()
  or public.current_user_is_admin()
);

drop policy if exists "exercise_folder_access_admin_manage" on public.exercise_folder_access;
create policy "exercise_folder_access_admin_manage"
on public.exercise_folder_access for all
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "exercise_student_access_admin_manage" on public.exercise_student_access;
create policy "exercise_student_access_admin_manage"
on public.exercise_student_access for all
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "subscription_products_public_read" on public.subscription_products;
create policy "subscription_products_public_read"
on public.subscription_products for select
using (is_active or public.current_user_is_admin());

drop policy if exists "subscription_products_admin_manage" on public.subscription_products;
create policy "subscription_products_admin_manage"
on public.subscription_products for all
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "payments_read_own_or_admin" on public.payment_transactions;
create policy "payments_read_own_or_admin"
on public.payment_transactions for select
using (
  student_id = auth.uid()
  or public.current_user_is_admin()
);

drop policy if exists "payments_admin_manage" on public.payment_transactions;
create policy "payments_admin_manage"
on public.payment_transactions for all
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

create or replace function public.notify_admin_on_student_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  student_name text;
  purpose_label text;
  amount_label text;
  notify_message text;
  inserted integer;
begin
  if new.status is distinct from 'confirmed' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'confirmed' then
    return new;
  end if;

  select coalesce(
    nullif(trim(full_name), ''),
    nullif(trim(email), ''),
    'Ученик'
  )
  into student_name
  from public.profiles
  where id = new.student_id;

  student_name := coalesce(student_name, 'Ученик');

  purpose_label := case new.purpose
    when 'lesson_debt' then 'задолженность за занятия'
    when 'lesson_package' then 'пакет занятий'
    when 'app_subscription' then
      case
        when coalesce(new.product_code, '') ilike '%duo%' then 'подписку Duo'
        else 'подписку приложения'
      end
    else 'оплату'
  end;

  amount_label := trim(to_char(new.amount_rub, 'FM999999990')) || ' ₽';
  notify_message := student_name || ' оплатил(а) ' || purpose_label || ': ' || amount_label;

  insert into public.notifications (
    recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
  )
  select
    p.id,
    'admin',
    'Оплата',
    notify_message,
    'payment',
    '/dashboard/admin?tab=students',
    now() + interval '5 minutes'
  from public.profiles p
  where p.role = 'admin';

  get diagnostics inserted = row_count;
  if inserted = 0 then
    insert into public.notifications (
      recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
    )
    values (
      null,
      'admin',
      'Оплата',
      notify_message,
      'payment',
      '/dashboard/admin?tab=students',
      now() + interval '5 minutes'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_student_payment_confirmed on public.payment_transactions;
create trigger on_student_payment_confirmed
after insert or update of status on public.payment_transactions
for each row
execute procedure public.notify_admin_on_student_payment();

create or replace function public.user_can_access_exercise(
  target_exercise_id uuid,
  target_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_exercise public.exercises%rowtype;
  target_profile public.profiles%rowtype;
  explicit_effect text;
  selected_match boolean;
  rules_match boolean;
  tier_rank integer;
  required_tier_rank integer;
  cat_rank integer;
  required_cat_rank integer;
begin
  if target_user_id is null then return false; end if;

  select * into target_exercise
  from public.exercises
  where id = target_exercise_id;

  if not found or not target_exercise.is_published then return false; end if;

  select * into target_profile
  from public.profiles
  where id = target_user_id;

  if not found then return false; end if;
  if target_profile.role = 'admin' then return true; end if;

  select effect into explicit_effect
  from public.exercise_student_access
  where exercise_id = target_exercise_id
    and student_id = target_user_id;

  if explicit_effect = 'deny' then return false; end if;
  if explicit_effect = 'allow' then return true; end if;

  selected_match := exists (
    select 1
    from public.exercise_folder_access efa
    join public.student_folder_members sfm
      on sfm.folder_id = efa.folder_id
    where efa.exercise_id = target_exercise_id
      and sfm.student_id = target_user_id
  );

  tier_rank := case target_profile.app_sub_tier
    when 'none' then 0 when 'standard' then 1 when 'premium' then 2 else 3 end;
  required_tier_rank := case target_exercise.min_tier_required
    when 'none' then 0 when 'standard' then 1 when 'premium' then 2 else 3 end;
  cat_rank := case target_profile.cat_level
    when 'beginner' then 0 when 'basic' then 1 when 'pro' then 2 else 3 end;
  required_cat_rank := case target_exercise.min_cat_level
    when 'beginner' then 0 when 'basic' then 1 when 'pro' then 2 else 3 end;

  rules_match :=
    tier_rank >= required_tier_rank
    and cat_rank >= required_cat_rank
    and (not target_exercise.active_students_only or target_profile.is_active_student);

  return case target_exercise.audience_mode
    when 'selected' then selected_match
    when 'rules_or_selected' then rules_match or selected_match
    else rules_match
  end;
end;
$$;

drop policy if exists "exercises_authenticated_read" on public.exercises;
drop policy if exists "exercises_audience_read" on public.exercises;
create policy "exercises_audience_read"
on public.exercises for select
to authenticated
using (public.user_can_access_exercise(id, auth.uid()));

create or replace function public.upgrade_duo_subscription(new_tier text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_partner_id uuid;
begin
  if new_tier not in ('standard', 'premium', 'vip') then
    raise exception 'Invalid Duo tier';
  end if;

  update public.profiles
  set app_sub_tier = new_tier,
      app_sub_variant = 'duo_owner'
  where id = auth.uid() and role = 'student';

  if not found then raise exception 'Student profile was not found'; end if;

  insert into public.duo_subscriptions (owner_id, tier, status)
  values (auth.uid(), new_tier, 'awaiting_partner')
  on conflict (owner_id) do update
  set tier = excluded.tier,
      status = case
        when duo_subscriptions.partner_id is null then 'awaiting_partner'
        else 'active'
      end,
      cancelled_at = null;

  select partner_id into current_partner_id
  from public.duo_subscriptions
  where owner_id = auth.uid();

  if current_partner_id is not null then
    update public.profiles
    set app_sub_tier = new_tier,
        app_sub_variant = 'duo_member'
    where id = current_partner_id;
  end if;
end;
$$;

revoke all on function public.upgrade_duo_subscription(text) from public;
grant execute on function public.upgrade_duo_subscription(text) to authenticated;

create or replace function public.link_duo_partner(partner_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  duo_record public.duo_subscriptions%rowtype;
  partner_profile public.profiles%rowtype;
begin
  select * into duo_record
  from public.duo_subscriptions
  where owner_id = auth.uid()
  for update;

  if not found or duo_record.status <> 'awaiting_partner' then
    raise exception 'Duo partner can only be changed by administrator';
  end if;
  if duo_record.partner_id is not null then
    raise exception 'Duo partner is already linked';
  end if;

  select * into partner_profile
  from public.profiles
  where lower(email) = lower(trim(partner_email))
    and role = 'student';

  if not found then raise exception 'Student with this email was not found'; end if;
  if partner_profile.id = auth.uid() then raise exception 'You cannot link your own account'; end if;
  if exists (
    select 1 from public.duo_subscriptions
    where status in ('awaiting_partner', 'active')
      and (owner_id = partner_profile.id or partner_id = partner_profile.id)
  ) then
    raise exception 'This account already participates in Duo';
  end if;

  update public.duo_subscriptions
  set partner_id = partner_profile.id,
      status = 'active',
      partner_previous_tier = partner_profile.app_sub_tier,
      partner_previous_variant = partner_profile.app_sub_variant,
      linked_at = now()
  where id = duo_record.id;

  update public.profiles
  set app_sub_tier = duo_record.tier,
      app_sub_variant = 'duo_member'
  where id = partner_profile.id;

  insert into public.notifications (
    recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
  )
  values (
    partner_profile.id,
    'student',
    'Duo подключён',
    'Друг подключил ваш аккаунт к тарифу ' || upper(duo_record.tier) || ' Duo',
    'payment',
    '/dashboard/student',
    now() + interval '5 minutes'
  );
end;
$$;

revoke all on function public.link_duo_partner(text) from public;
grant execute on function public.link_duo_partner(text) to authenticated;

create or replace function public.admin_change_duo_partner(
  duo_owner_id uuid,
  new_partner_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  duo_record public.duo_subscriptions%rowtype;
  new_partner public.profiles%rowtype;
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;

  select * into duo_record
  from public.duo_subscriptions
  where owner_id = duo_owner_id
  for update;
  if not found then raise exception 'Duo subscription was not found'; end if;

  if duo_record.partner_id is not null then
    update public.profiles
    set app_sub_tier = coalesce(duo_record.partner_previous_tier, 'none'),
        app_sub_variant = coalesce(duo_record.partner_previous_variant, 'individual')
    where id = duo_record.partner_id;
  end if;

  select * into new_partner
  from public.profiles
  where lower(email) = lower(trim(new_partner_email))
    and role = 'student';
  if not found then raise exception 'Student with this email was not found'; end if;
  if new_partner.id = duo_owner_id then raise exception 'Owner cannot be a partner'; end if;

  update public.duo_subscriptions
  set partner_id = new_partner.id,
      status = 'active',
      partner_previous_tier = new_partner.app_sub_tier,
      partner_previous_variant = new_partner.app_sub_variant,
      linked_at = now()
  where id = duo_record.id;

  update public.profiles
  set app_sub_tier = duo_record.tier,
      app_sub_variant = 'duo_member'
  where id = new_partner.id;
end;
$$;

revoke all on function public.admin_change_duo_partner(uuid, text) from public;
grant execute on function public.admin_change_duo_partner(uuid, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exercise-media',
  'exercise-media',
  false,
  104857600,
  array['audio/mpeg', 'audio/wav', 'audio/ogg', 'video/mp4', 'video/webm']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "exercise_media_admin_manage" on storage.objects;
create policy "exercise_media_admin_manage"
on storage.objects for all
using (
  bucket_id = 'exercise-media'
  and public.current_user_is_admin()
)
with check (
  bucket_id = 'exercise-media'
  and public.current_user_is_admin()
);

drop policy if exists "exercise_media_audience_read" on storage.objects;
create policy "exercise_media_audience_read"
on storage.objects for select
using (
  bucket_id = 'exercise-media'
  and exists (
    select 1
    from public.exercises
    where exercises.storage_path = storage.objects.name
      and public.user_can_access_exercise(exercises.id, auth.uid())
  )
);

create or replace function public.chat_notification_preview(raw text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(raw, '') ~ '\{"v"\s*:\s*1'
      or coalesce(raw, '') like '%"overallScore"%'
      or coalesce(raw, '') like '%Отчёт вокалиста%'
      or coalesce(raw, '') like '%Отчет вокалиста%'
    then 'Отчет от ученика'
    else left(coalesce(raw, ''), 450)
  end;
$$;

create or replace function public.notify_chat_recipient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sender_id = new.student_id then
    insert into public.notifications (
      recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
    )
    select
      profile.id,
      'admin',
      'Новое сообщение',
      new.sender_name || ': ' || public.chat_notification_preview(new.message),
      'chat',
      '/dashboard/admin?tab=chat&student=' || new.student_id::text,
      now() + interval '5 minutes'
    from public.profiles as profile
    where profile.role = 'admin';
  else
    insert into public.notifications (
      recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
    )
    values (
      new.student_id,
      'student',
      'Новое сообщение',
      new.sender_name || ': ' || public.chat_notification_preview(new.message),
      'chat',
      '/dashboard/student?tab=chat',
      now() + interval '5 minutes'
    );
  end if;

  return new;
end;
$$;

-- ============================================================================
-- Group chats (admin-created, membership-based)
-- ============================================================================

create table if not exists public.group_chats (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.group_chat_members (
  group_id uuid not null references public.group_chats(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, student_id)
);

create table if not exists public.group_chat_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.group_chats(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_name text not null,
  message text not null check (char_length(message) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists group_chat_messages_group_created_idx
  on public.group_chat_messages (group_id, created_at);

create or replace function public.user_is_group_chat_member(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_is_admin()
  or exists (
    select 1
    from public.group_chat_members
    where group_id = target_group_id
      and student_id = auth.uid()
  );
$$;

alter table public.group_chats enable row level security;
alter table public.group_chat_members enable row level security;
alter table public.group_chat_messages enable row level security;

drop policy if exists "group_chats_read_members" on public.group_chats;
create policy "group_chats_read_members"
on public.group_chats for select
using (public.user_is_group_chat_member(id));

drop policy if exists "group_chats_admin_manage" on public.group_chats;
create policy "group_chats_admin_manage"
on public.group_chats for all
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "group_chat_members_read" on public.group_chat_members;
create policy "group_chat_members_read"
on public.group_chat_members for select
using (
  student_id = auth.uid()
  or public.current_user_is_admin()
);

drop policy if exists "group_chat_members_admin_manage" on public.group_chat_members;
create policy "group_chat_members_admin_manage"
on public.group_chat_members for all
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "group_chat_messages_read" on public.group_chat_messages;
create policy "group_chat_messages_read"
on public.group_chat_messages for select
using (public.user_is_group_chat_member(group_id));

drop policy if exists "group_chat_messages_send" on public.group_chat_messages;
create policy "group_chat_messages_send"
on public.group_chat_messages for insert
with check (
  sender_id = auth.uid()
  and public.user_is_group_chat_member(group_id)
  and (
    public.current_user_is_admin()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and app_sub_tier <> 'none'
    )
  )
);

create or replace function public.create_group_chat(
  chat_title text,
  student_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_group_id uuid;
  member_id uuid;
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;
  if chat_title is null or char_length(trim(chat_title)) < 1 then
    raise exception 'Group title is required';
  end if;
  if student_ids is null or cardinality(student_ids) = 0 then
    raise exception 'Select at least one student';
  end if;

  insert into public.group_chats (title, created_by)
  values (trim(chat_title), auth.uid())
  returning id into new_group_id;

  foreach member_id in array student_ids loop
    if exists (
      select 1 from public.profiles
      where id = member_id and role = 'student'
    ) then
      insert into public.group_chat_members (group_id, student_id)
      values (new_group_id, member_id)
      on conflict do nothing;

      insert into public.notifications (
        recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
      )
      values (
        member_id,
        'student',
        'Новый групповой чат',
        'Вас добавили в чат «' || trim(chat_title) || '»',
        'chat',
        '/dashboard/student?tab=chat&group=' || new_group_id::text,
        now() + interval '5 minutes'
      );
    end if;
  end loop;

  return new_group_id;
end;
$$;

revoke all on function public.create_group_chat(text, uuid[]) from public;
grant execute on function public.create_group_chat(text, uuid[]) to authenticated;

create or replace function public.notify_group_chat_recipient()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  group_title text;
  preview text := public.chat_notification_preview(new.message);
begin
  select title into group_title from public.group_chats where id = new.group_id;

  insert into public.notifications (
    recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
  )
  select
    member.student_id,
    'student',
    coalesce(group_title, 'Групповой чат'),
    new.sender_name || ': ' || preview,
    'chat',
    '/dashboard/student?tab=chat&group=' || new.group_id::text,
    now() + interval '5 minutes'
  from public.group_chat_members member
  where member.group_id = new.group_id
    and member.student_id <> new.sender_id;

  if exists (
    select 1 from public.profiles where id = new.sender_id and role = 'student'
  ) then
    insert into public.notifications (
      recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
    )
    select
      profile.id,
      'admin',
      coalesce(group_title, 'Групповой чат'),
      new.sender_name || ': ' || preview,
      'chat',
      '/dashboard/admin?tab=chat&group=' || new.group_id::text,
      now() + interval '5 minutes'
    from public.profiles as profile
    where profile.role = 'admin';
  end if;

  return new;
end;
$$;

drop trigger if exists on_group_chat_message_created on public.group_chat_messages;
create trigger on_group_chat_message_created
  after insert on public.group_chat_messages
  for each row execute procedure public.notify_group_chat_recipient();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'group_chat_messages'
  ) then
    alter publication supabase_realtime add table public.group_chat_messages;
  end if;
end $$;

-- ============================================================================
-- Chat media, live profile sync, lesson homework history
-- ============================================================================

alter table public.chat_messages
  add column if not exists message_type text not null default 'text',
  add column if not exists media_path text,
  add column if not exists media_mime text,
  add column if not exists media_duration_sec integer;

alter table public.chat_messages
  drop constraint if exists chat_messages_message_type_check;
alter table public.chat_messages
  add constraint chat_messages_message_type_check
  check (message_type in ('text', 'voice', 'image', 'sticker', 'video', 'announcement', 'vocal_report'));

alter table public.chat_messages
  drop constraint if exists chat_messages_message_check;
alter table public.chat_messages
  add constraint chat_messages_message_check
  check (
    (message_type in ('text', 'announcement', 'vocal_report') and char_length(message) between 1 and 2000)
    or (message_type not in ('text', 'announcement', 'vocal_report') and char_length(coalesce(message, '')) <= 2000)
  );

alter table public.group_chat_messages
  add column if not exists message_type text not null default 'text',
  add column if not exists media_path text,
  add column if not exists media_mime text,
  add column if not exists media_duration_sec integer;

alter table public.group_chat_messages
  drop constraint if exists group_chat_messages_message_type_check;
alter table public.group_chat_messages
  add constraint group_chat_messages_message_type_check
  check (message_type in ('text', 'voice', 'image', 'sticker', 'video', 'announcement', 'vocal_report'));

alter table public.group_chat_messages
  drop constraint if exists group_chat_messages_message_check;
alter table public.group_chat_messages
  add constraint group_chat_messages_message_check
  check (
    (message_type in ('text', 'announcement', 'vocal_report') and char_length(message) between 1 and 2000)
    or (message_type not in ('text', 'announcement', 'vocal_report') and char_length(coalesce(message, '')) <= 2000)
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media',
  'chat-media',
  false,
  41943040,
  array[
    'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav',
    'audio/x-wav', 'audio/aac', 'audio/x-m4a',
    'video/webm', 'video/mp4', 'video/quicktime',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'image/heic', 'image/heif'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "chat_media_admin_manage" on storage.objects;
create policy "chat_media_admin_manage"
on storage.objects for all
using (
  bucket_id = 'chat-media'
  and public.current_user_is_admin()
)
with check (
  bucket_id = 'chat-media'
  and public.current_user_is_admin()
);

drop policy if exists "chat_media_owner_upload" on storage.objects;
create policy "chat_media_owner_upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "chat_media_participant_read" on storage.objects;
create policy "chat_media_participant_read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'chat-media'
  and (
    public.current_user_is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.chat_messages
      where media_path = storage.objects.name
        and (student_id = auth.uid() or sender_id = auth.uid())
    )
    or exists (
      select 1
      from public.group_chat_messages gcm
      where gcm.media_path = storage.objects.name
        and public.user_is_group_chat_member(gcm.group_id)
    )
  )
);

create table if not exists public.lesson_homework (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid references public.lessons(id) on delete set null,
  student_id uuid not null references public.profiles(id) on delete cascade,
  lesson_datetime timestamptz,
  homework text not null check (char_length(homework) between 1 and 4000),
  teacher_comment text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists lesson_homework_student_created_idx
  on public.lesson_homework (student_id, created_at desc);

alter table public.lesson_homework enable row level security;

drop policy if exists "lesson_homework_read_own_or_admin" on public.lesson_homework;
create policy "lesson_homework_read_own_or_admin"
on public.lesson_homework for select
using (
  student_id = auth.uid()
  or public.current_user_is_admin()
);

drop policy if exists "lesson_homework_admin_manage" on public.lesson_homework;
create policy "lesson_homework_admin_manage"
on public.lesson_homework for all
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

create or replace function public.admin_assign_homework(
  target_student_id uuid,
  homework_text text,
  teacher_comment_text text default '',
  target_lesson_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  lesson_dt timestamptz;
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access required';
  end if;
  if homework_text is null or char_length(trim(homework_text)) < 1 then
    raise exception 'Homework text is required';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = target_student_id and role = 'student'
  ) then
    raise exception 'Student was not found';
  end if;

  if target_lesson_id is not null then
    select datetime into lesson_dt
    from public.lessons
    where id = target_lesson_id
      and student_id = target_student_id;
    if not found then
      raise exception 'Lesson was not found for this student';
    end if;
  end if;

  insert into public.lesson_homework (
    lesson_id, student_id, lesson_datetime, homework, teacher_comment, created_by
  )
  values (
    target_lesson_id,
    target_student_id,
    lesson_dt,
    trim(homework_text),
    coalesce(trim(teacher_comment_text), ''),
    auth.uid()
  )
  returning id into new_id;

  insert into public.notifications (
    recipient_id, recipient_role, title, message, kind, action_url, email_fallback_at
  )
  values (
    target_student_id,
    'student',
    'Новое домашнее задание',
    left(trim(homework_text), 450),
    'lesson',
    '/dashboard/student?tab=notes',
    now() + interval '5 minutes'
  );

  return new_id;
end;
$$;

revoke all on function public.admin_assign_homework(uuid, text, text, uuid) from public;
grant execute on function public.admin_assign_homework(uuid, text, text, uuid) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'lessons'
  ) then
    alter publication supabase_realtime add table public.lessons;
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'lesson_homework'
  ) then
    alter publication supabase_realtime add table public.lesson_homework;
  end if;
end $$;

-- ============================================================================
-- AI tools access (admin-configurable paywall)
-- ============================================================================

create table if not exists public.ai_tool_access (
  tool_id text primary key
    check (tool_id in ('tuner', 'remover', 'timbre', 'mixer', 'pitchshift')),
  min_tier text not null default 'none'
    check (min_tier in ('none', 'standard', 'premium', 'vip')),
  enabled boolean not null default true,
  title text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.ai_tool_access enable row level security;

drop policy if exists "ai_tool_access_read_authenticated" on public.ai_tool_access;
create policy "ai_tool_access_read_authenticated"
on public.ai_tool_access for select
to authenticated
using (true);

drop policy if exists "ai_tool_access_admin_manage" on public.ai_tool_access;
create policy "ai_tool_access_admin_manage"
on public.ai_tool_access for all
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

insert into public.ai_tool_access (tool_id, min_tier, enabled, title)
values
  ('tuner', 'none', true, 'Нейроанализатор нот'),
  ('remover', 'premium', true, 'Удаление вокала'),
  ('timbre', 'premium', true, 'Звёздный двойник'),
  ('mixer', 'standard', true, 'Сведение дорожек'),
  ('pitchshift', 'standard', true, 'Изменение тональности')
on conflict (tool_id) do nothing;

update public.ai_tool_access
set title = 'Нейроанализатор нот'
where tool_id = 'tuner';

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ai_tool_access'
  ) then
    alter publication supabase_realtime add table public.ai_tool_access;
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-audio',
  'student-audio',
  false,
  52428800,
  array['audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/wav', 'audio/ogg']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.student_audio_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source text not null check (source in ('remover_minus', 'remover_vocal', 'mixer', 'pitchshift')),
  title text not null check (char_length(title) between 1 and 120),
  duration_sec numeric not null check (duration_sec > 0),
  storage_path text not null unique,
  mime text not null,
  size_bytes integer not null check (size_bytes > 0),
  created_at timestamptz not null default now()
);

create index if not exists student_audio_tracks_user_created_idx
  on public.student_audio_tracks (user_id, created_at desc);

alter table public.student_audio_tracks enable row level security;

drop policy if exists "student_audio_select_own_or_admin" on public.student_audio_tracks;
create policy "student_audio_select_own_or_admin"
on public.student_audio_tracks for select
to authenticated
using (user_id = auth.uid() or public.current_user_is_admin());

drop policy if exists "student_audio_insert_own" on public.student_audio_tracks;
create policy "student_audio_insert_own"
on public.student_audio_tracks for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "student_audio_delete_own_or_admin" on public.student_audio_tracks;
create policy "student_audio_delete_own_or_admin"
on public.student_audio_tracks for delete
to authenticated
using (user_id = auth.uid() or public.current_user_is_admin());

drop policy if exists "student_audio_update_own_or_admin" on public.student_audio_tracks;
create policy "student_audio_update_own_or_admin"
on public.student_audio_tracks for update
to authenticated
using (user_id = auth.uid() or public.current_user_is_admin())
with check (user_id = auth.uid() or public.current_user_is_admin());

create or replace function public.enforce_student_audio_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  track_count integer;
begin
  if public.current_user_is_admin() then
    return NEW;
  end if;

  if NEW.duration_sec > 600 then
    raise exception 'Ученикам можно сохранять трек не длиннее 10 минут';
  end if;

  select count(*)::integer
    into track_count
  from public.student_audio_tracks
  where user_id = NEW.user_id;

  if track_count >= 10 then
    raise exception 'Можно хранить 10 треков. Удалите старый в «Мои аудио»';
  end if;

  return NEW;
end;
$$;

drop trigger if exists student_audio_limits_before_insert on public.student_audio_tracks;
create trigger student_audio_limits_before_insert
before insert on public.student_audio_tracks
for each row
execute procedure public.enforce_student_audio_limits();

drop policy if exists "student_audio_admin_manage" on storage.objects;
create policy "student_audio_admin_manage"
on storage.objects for all
using (
  bucket_id = 'student-audio'
  and public.current_user_is_admin()
)
with check (
  bucket_id = 'student-audio'
  and public.current_user_is_admin()
);

drop policy if exists "student_audio_owner_insert" on storage.objects;
create policy "student_audio_owner_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'student-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "student_audio_owner_select" on storage.objects;
create policy "student_audio_owner_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'student-audio'
  and (
    public.current_user_is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

drop policy if exists "student_audio_owner_delete" on storage.objects;
create policy "student_audio_owner_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'student-audio'
  and (
    public.current_user_is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

create table if not exists public.vocal_test_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null check (mode in ('note', 'scale')),
  target_label text not null default '',
  duration_sec numeric not null default 10,
  overall_score integer not null,
  pitch_accuracy integer not null,
  tone_stability integer not null,
  breath_control integer not null,
  too_quiet boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists vocal_test_results_user_created_idx
  on public.vocal_test_results (user_id, created_at desc);

alter table public.vocal_test_results enable row level security;

drop policy if exists "vocal_test_results_read_own_or_admin" on public.vocal_test_results;
create policy "vocal_test_results_read_own_or_admin"
on public.vocal_test_results for select
to authenticated
using (user_id = auth.uid() or public.current_user_is_admin());

drop policy if exists "vocal_test_results_insert_own" on public.vocal_test_results;
create policy "vocal_test_results_insert_own"
on public.vocal_test_results for insert
to authenticated
with check (user_id = auth.uid() or public.current_user_is_admin());

