-- Vocal test history + allow report JSON in teacher chat. Safe to re-run.

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

alter table public.chat_messages
  drop constraint if exists chat_messages_message_type_check;
alter table public.chat_messages
  add constraint chat_messages_message_type_check
  check (message_type in ('text', 'voice', 'image', 'sticker', 'video', 'announcement', 'vocal_report'));

alter table public.group_chat_messages
  drop constraint if exists group_chat_messages_message_type_check;
alter table public.group_chat_messages
  add constraint group_chat_messages_message_type_check
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
  drop constraint if exists group_chat_messages_message_check;
alter table public.group_chat_messages
  add constraint group_chat_messages_message_check
  check (
    (message_type in ('text', 'announcement', 'vocal_report') and char_length(message) between 1 and 2000)
    or (message_type not in ('text', 'announcement', 'vocal_report') and char_length(coalesce(message, '')) <= 2000)
  );
