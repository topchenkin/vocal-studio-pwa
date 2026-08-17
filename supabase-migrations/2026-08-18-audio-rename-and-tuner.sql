-- Track title edits + tuner display name. Safe to re-run.

drop policy if exists "student_audio_update_own_or_admin" on public.student_audio_tracks;
create policy "student_audio_update_own_or_admin"
on public.student_audio_tracks for update
to authenticated
using (user_id = auth.uid() or public.current_user_is_admin())
with check (user_id = auth.uid() or public.current_user_is_admin());

update public.ai_tool_access
set title = 'Нейроанализатор нот'
where tool_id = 'tuner';
