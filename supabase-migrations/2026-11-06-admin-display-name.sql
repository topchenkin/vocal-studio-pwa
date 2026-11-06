-- Admin-only label so two students with the same registered name can be told apart
-- in the teacher CRM. Does not replace profiles.full_name (student cabinet, chat, gifts).
alter table public.profiles
  add column if not exists admin_display_name text;

comment on column public.profiles.admin_display_name is
  'Optional name shown only in the admin cabinet instead of full_name.';
