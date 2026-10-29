-- Intro quiz from the home page. Guests answer in the browser; after sign-up the cabinet
-- saves the answers here once, so the teacher sees them before the trial lesson.
-- `cat_level` is only the starting hint shown to the visitor, not the student's real level.

create table if not exists public.intro_quiz_answers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  goal text not null check (goal in ('soul', 'event', 'record', 'stage')),
  experience text not null check (experience in ('never', 'self', 'before', 'perform')),
  barrier text not null check (barrier in ('ear', 'shy', 'late', 'time', 'none')),
  outcome text not null check (outcome in ('song', 'pitch', 'range', 'fear', 'ease')),
  format text not null check (format in ('city', 'online')),
  cat_level text not null check (cat_level in ('beginner', 'basic', 'pro', 'star')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.intro_quiz_answers enable row level security;

drop policy if exists "intro_quiz_read_own_or_admin" on public.intro_quiz_answers;
create policy "intro_quiz_read_own_or_admin"
on public.intro_quiz_answers for select
to authenticated
using (user_id = auth.uid() or public.current_user_is_admin());

drop policy if exists "intro_quiz_insert_own" on public.intro_quiz_answers;
create policy "intro_quiz_insert_own"
on public.intro_quiz_answers for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "intro_quiz_update_own" on public.intro_quiz_answers;
create policy "intro_quiz_update_own"
on public.intro_quiz_answers for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select, insert, update on public.intro_quiz_answers to authenticated;

create or replace function public.touch_intro_quiz_answers()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists intro_quiz_answers_touch on public.intro_quiz_answers;
create trigger intro_quiz_answers_touch
before update on public.intro_quiz_answers
for each row execute function public.touch_intro_quiz_answers();
