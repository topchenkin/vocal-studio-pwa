-- Rename student-facing AI tool titles. Safe to re-run.

update public.ai_tool_access
set title = 'Нейроанализ голоса'
where tool_id = 'tuner'
  and title in ('ИИ-Тюнер нот', 'ИИ-тюнер нот');

update public.ai_tool_access
set title = 'Звёздный двойник'
where tool_id = 'timbre'
  and title in ('Похожий тембр');
