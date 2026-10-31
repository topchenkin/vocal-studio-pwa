-- Cabinet feature access (chat, exercises) next to AI tools in ai_tool_access.
-- Keeps current tool min_tiers. Opens teacher chat for tier "none".

do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'ai_tool_access'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%tool_id%'
  loop
    execute format('alter table public.ai_tool_access drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.ai_tool_access
  add constraint ai_tool_access_tool_id_check
  check (tool_id in (
    'tuner', 'remover', 'timbre', 'mixer', 'pitchshift',
    'musicgen', 'vocalfx', 'chordloop', 'chat', 'exercises'
  ));

insert into public.ai_tool_access (tool_id, min_tier, enabled, title)
values
  ('chat', 'none', true, 'Чат с преподавателем'),
  ('exercises', 'none', true, 'Распевки и упражнения')
on conflict (tool_id) do nothing;

update public.ai_tool_access
set
  min_tier = 'none',
  enabled = true,
  title = 'Чат с преподавателем'
where tool_id = 'chat';

update public.ai_tool_access
set title = coalesce(nullif(title, ''), 'Распевки и упражнения')
where tool_id = 'exercises';

create or replace function public.feature_tier_rank(p_tier text)
returns integer
language sql
immutable
as $$
  select case p_tier
    when 'standard' then 1
    when 'premium' then 2
    when 'vip' then 3
    else 0
  end;
$$;

create or replace function public.current_user_can_use_feature(p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_is_admin()
    or exists (
      select 1
      from public.profiles as p
      left join public.ai_tool_access as a
        on a.tool_id = p_feature
      where p.id = auth.uid()
        and coalesce(a.enabled, true)
        and public.feature_tier_rank(
          case
            when p.app_sub_expires_at is not null
                 and p.app_sub_expires_at <= now()
              then 'none'
            else coalesce(p.app_sub_tier, 'none')
          end
        ) >= public.feature_tier_rank(coalesce(a.min_tier, 'none'))
    );
$$;

revoke all on function public.feature_tier_rank(text) from public;
grant execute on function public.feature_tier_rank(text) to authenticated;

revoke all on function public.current_user_can_use_feature(text) from public;
revoke all on function public.current_user_can_use_feature(text) from anon;
grant execute on function public.current_user_can_use_feature(text) to authenticated;

drop policy if exists "chat_messages_send_participants" on public.chat_messages;
create policy "chat_messages_send_participants"
on public.chat_messages for insert
with check (
  sender_id = auth.uid()
  and (
    public.current_user_is_admin()
    or (
      student_id = auth.uid()
      and public.current_user_can_use_feature('chat')
    )
  )
);

drop policy if exists "group_chat_messages_send" on public.group_chat_messages;
create policy "group_chat_messages_send"
on public.group_chat_messages for insert
with check (
  sender_id = auth.uid()
  and public.user_is_group_chat_member(group_id)
  and (
    public.current_user_is_admin()
    or public.current_user_can_use_feature('chat')
  )
);
