-- Teacher-owned schedule + chat edit/delete support
-- Run in Supabase SQL editor if columns / policies are missing.

alter table public.lessons
  add column if not exists series_id uuid,
  add column if not exists is_recurring boolean not null default false,
  add column if not exists preferred_reschedule_at timestamptz;

alter table public.chat_messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.group_chat_messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

-- Direct chat: student + teacher may edit/delete any message in the thread
-- (static GitHub Pages has no Next.js API for PATCH/DELETE).
drop policy if exists "chat_messages_update_own_or_admin" on public.chat_messages;
drop policy if exists "chat_messages_update_participants" on public.chat_messages;
create policy "chat_messages_update_participants"
on public.chat_messages for update
using (
  student_id = auth.uid()
  or public.current_user_is_admin()
)
with check (
  student_id = auth.uid()
  or public.current_user_is_admin()
);

drop policy if exists "chat_messages_delete_own_or_admin" on public.chat_messages;
drop policy if exists "chat_messages_delete_participants" on public.chat_messages;
create policy "chat_messages_delete_participants"
on public.chat_messages for delete
using (
  student_id = auth.uid()
  or public.current_user_is_admin()
);

-- Group chat: any member (incl. admin) may edit/delete
drop policy if exists "group_chat_messages_update_own_or_admin" on public.group_chat_messages;
drop policy if exists "group_chat_messages_update_participants" on public.group_chat_messages;
create policy "group_chat_messages_update_participants"
on public.group_chat_messages for update
using (public.user_is_group_chat_member(group_id))
with check (public.user_is_group_chat_member(group_id));

drop policy if exists "group_chat_messages_delete_own_or_admin" on public.group_chat_messages;
drop policy if exists "group_chat_messages_delete_participants" on public.group_chat_messages;
create policy "group_chat_messages_delete_participants"
on public.group_chat_messages for delete
using (public.user_is_group_chat_member(group_id));
