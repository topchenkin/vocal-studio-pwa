-- Teacher-owned schedule + chat edit/delete support
-- Run in Supabase SQL editor if columns are missing.

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

-- Soft-delete / edit via service role API; optional client policies:
drop policy if exists "chat_messages_update_own_or_admin" on public.chat_messages;
create policy "chat_messages_update_own_or_admin"
on public.chat_messages for update
using (
  sender_id = auth.uid()
  or public.current_user_is_admin()
);

drop policy if exists "chat_messages_delete_own_or_admin" on public.chat_messages;
create policy "chat_messages_delete_own_or_admin"
on public.chat_messages for delete
using (
  sender_id = auth.uid()
  or public.current_user_is_admin()
);

drop policy if exists "group_chat_messages_update_own_or_admin" on public.group_chat_messages;
create policy "group_chat_messages_update_own_or_admin"
on public.group_chat_messages for update
using (
  sender_id = auth.uid()
  or public.current_user_is_admin()
);

drop policy if exists "group_chat_messages_delete_own_or_admin" on public.group_chat_messages;
create policy "group_chat_messages_delete_own_or_admin"
on public.group_chat_messages for delete
using (
  sender_id = auth.uid()
  or public.current_user_is_admin()
);
