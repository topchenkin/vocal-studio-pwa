# Обновление Supabase и production

**Боевой сайт — только Timeweb Cloud Apps:** https://www.uniquevocal.ru
(A → `92.246.76.92`). GitHub Actions запускает workflow **CI**: `npm run build`
и typecheck. Это проверка, а не публикация. Деплой на GitHub Pages отключён:
зелёный Pages раньше выглядел как «сайт упал», а CNAME `www` → `*.github.io`
отправлял пользователей из РФ на заблокированные IP GitHub.

GitHub → Settings → Pages:
- Source / custom domain — **выключено / пусто**. Не включать и не указывать
  `uniquevocal.ru` / `www.uniquevocal.ru`.
- Файл `public/CNAME` удалён специально и **нельзя возвращать**.
- Environment `github-pages` не используется.

Optional FTP (`deploy-ftp.yml`) — ручная заливка той же статики `out/` на
хостинг, не GitHub Pages.

## Supabase и переменные

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

## Доступ из России (без VPN)

Статика (HTML/JS/шрифты) должна открываться с Timeweb `92.246.76.92`.
Кабинет, вход и чат ходят **из браузера** на `*.supabase.co` — это не Россия.
`output: "export"` не умеет проксировать Supabase; для этого нужен сервер
(Timeweb Next.js без static export, reverse proxy, или свой домен Supabase).

Проверьте DNS в reg.ru:

1. `@` и `www` — только A → `92.246.76.92`. **Не должно быть CNAME**
   `www` → `*.github.io`.
2. GitHub → Settings → Pages: **Disabled**, Custom domain **пусто**.
   Файл `public/CNAME` удалён специально, чтобы Pages снова не забрал
   `www.uniquevocal.ru`. Не включайте Pages и не возвращайте CNAME.
3. После смены DNS подождите TTL или сбросьте кэш (`ipconfig /flushdns`).
   Старый CNAME в кэше провайдера отправляет `www` на GitHub, который из РФ
   часто не открывается — отсюда «нужен VPN», хотя хост российский.

Оплата сейчас работает в явно обозначенном Beta/sandbox-режиме: операция
записывается в `payment_transactions`, но деньги не списываются. Выдачу
боевого доступа позднее необходимо переключить на подтверждённый webhook
платёжного провайдера.
