-- Retire MusicGen from student tools. Safe to re-run.
-- Keep the tool_id in the check constraint so existing rows stay valid.

update public.ai_tool_access
set enabled = false,
    title = 'ИИ-композитор'
where tool_id = 'musicgen';
