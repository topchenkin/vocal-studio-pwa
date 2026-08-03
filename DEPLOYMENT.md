# Обновление Supabase и production

1. Выполнить целиком `supabase-schema.sql` в Supabase SQL Editor.
2. Проверить Storage buckets:
   - `exercise-media` — аудио/видео CMS (приватный)
   - `chat-media` — голосовые и фото в чатах (приватный)
3. Добавить в Vercel переменные:
   - `RESEND_API_KEY`
   - `EMAIL_FROM` — подтверждённый отправитель Resend
   - `CRON_SECRET` — длинная случайная строка
   - `NEXT_PUBLIC_APP_URL` — production URL без завершающего `/`
4. Настроить планировщик раз в минуту:

На Vercel это уже описано в `vercel.json` (cron на `/api/notifications/email-fallback`).
Достаточно задать `CRON_SECRET` в Environment Variables — Vercel отправит
`Authorization: Bearer <CRON_SECRET>` автоматически.

Либо вручную:

```text
GET/POST https://<production-domain>/api/notifications/email-fallback
Authorization: Bearer <CRON_SECRET>
```

Email отправляется только для непрочитанного уведомления, у которого прошло
не менее пяти минут. Без планировщика email-fallback не запускается.

Оплата сейчас работает в явно обозначенном Beta/sandbox-режиме: операция
записывается в `payment_transactions`, но деньги не списываются. Выдачу
боевого доступа позднее необходимо переключить на подтверждённый webhook
платёжного провайдера.
