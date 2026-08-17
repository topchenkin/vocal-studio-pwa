-- Rename student-facing AI tuner title. Safe to re-run.

update public.ai_tool_access
set title = 'Нейроанализ голоса'
where tool_id = 'tuner'
  and title in ('ИИ-Тюнер нот', 'ИИ-тюнер нот');
