-- Lesson format (in person / online) and the online lesson link.
-- Students can read their own profile row (policy profiles_select_own_or_admin);
-- only admins can update it (policy profiles_admin_update).

alter table public.profiles
  add column if not exists lesson_format text not null default 'offline';

alter table public.profiles drop constraint if exists profiles_lesson_format_check;
alter table public.profiles
  add constraint profiles_lesson_format_check
  check (lesson_format in ('offline', 'online'));

alter table public.profiles
  add column if not exists online_lesson_url text;

alter table public.profiles drop constraint if exists profiles_online_lesson_url_check;
alter table public.profiles
  add constraint profiles_online_lesson_url_check
  check (
    online_lesson_url is null
    or (online_lesson_url ~ '^https://[^[:space:]]+$' and length(online_lesson_url) <= 500)
  );

notify pgrst, 'reload schema';
