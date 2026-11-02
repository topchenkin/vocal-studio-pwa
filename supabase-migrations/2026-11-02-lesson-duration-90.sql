-- Allow 90-minute lessons (was 40–60).

alter table public.profiles drop constraint if exists profiles_lesson_duration_min_check;
alter table public.profiles
  add constraint profiles_lesson_duration_min_check
  check (lesson_duration_min between 40 and 90);

notify pgrst, 'reload schema';
