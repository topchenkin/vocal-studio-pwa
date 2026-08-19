# Обновление Supabase и production

**Боевой сайт — московский VPS Timeweb:** https://www.uniquevocal.ru
(A `@` / `www` / `sb` → `5.42.123.142`). Caddy отдаёт статику `out/` и
проксирует `sb.uniquevocal.ru`. GitHub Actions запускает workflow **CI**:
`npm run build` и typecheck — это проверка, не публикация. Деплой на
GitHub Pages **отключён**.

Корневой `Caddyfile` в репозитории **нельзя** возвращать: App Platform
Frontend подхватывает его и начинает отдавать `index.html` вместо JS/CSS.

Не включайте SSR/`npm start` на старом Frontend UniqueVocal — без папки
`out` сайт даёт пустой 404. После переноса DNS Frontend-приложение можно
остановить, чтобы не платить за сломанный Caddy.

GitHub → Settings → Pages:
- Source / custom domain — **выключено / пусто**. Не включать и не указывать
  `uniquevocal.ru` / `www.uniquevocal.ru`.
- Файл `public/CNAME` удалён специально и **нельзя возвращать**.
- Environment `github-pages` не используется.

Optional FTP (`deploy-ftp.yml`) — ручная заливка той же статики `out/` на
хостинг, не GitHub Pages.

## Почему без VPN видна страница GitHub Pages 404

Текст **«There isn't a GitHub Pages site here»** отдаёт **сервер GitHub**, не
Timeweb. Значит браузер всё ещё попадает на IP GitHub (`185.199.x.x`) или на
старый CNAME `www` → `*.github.io`.

Раньше сайт публиковался через GitHub Pages. В репозитории лежал `public/CNAME`
с `www.uniquevocal.ru`, а в reg.ru для `www` была CNAME-запись на
`topchenkin.github.io`. С VPN DNS часто шёл через зарубежный резолвер и
«маскировал» проблему; без VPN российский провайдер мог отдавать старый ответ
или GitHub из РФ был недоступен/таймаутился.

**Сейчас:** `@`, `www` и `sb` должны быть **A `5.42.123.142`** (московский VPS).
`92.246.76.92` — старый Frontend Apps, он отдаёт HTML вместо JS. GitHub Pages
на репозитории **выключен**.

Если у вас на телефоне всё ещё GitHub 404 — это **не** «Timeweb сломан», а одно
из:

1. **Кэш DNS у мобильного оператора** (старый CNAME/A на GitHub, TTL до суток).
2. **Старая иконка PWA** / кэш Safari с эпохи GitHub Pages — удалите приложение
   с домашнего экрана, очистите данные сайта, откройте заново.
3. **В reg.ru осталась лишняя запись** (см. чеклист ниже) — проверьте вручную.

Проверка с компьютера: `npm run check-dns` — скрипт опрашивает несколько
резолверов и подсветит, если где-то ещё GitHub.

### Чеклист reg.ru (обязательно)

1. Домен → DNS-серверы: `ns1.reg.ru`, `ns2.reg.ru`.
2. DNS-зона → **удалить** все записи:
   - CNAME `www` → `topchenkin.github.io` (или любой `*.github.io`);
   - A `@` или `www` → `185.199.108.153`, `185.199.109.153`, … (IP GitHub Pages);
   - любые AAAA, если они указывают не на Timeweb.
3. **Оставить только:**
   - A `@` → `5.42.123.142`
   - A `www` → `5.42.123.142`
   - A `sb` → `5.42.123.142`
4. Раздел «Переадресация» / парковка reg.ru — **выключено**.
5. TTL на время миграции можно поставить **600** (10 мин), потом вернуть 3600+.
6. GitHub → repo → Settings → Pages: custom domain **пусто**, Pages **Disabled**.
7. После смены DNS Frontend UniqueVocal можно остановить — сайт идёт с VPS.

На iPhone для проверки DNS: Wi‑Fi → DNS вручную `77.88.8.8` или `8.8.8.8`. Если
с таким DNS сайт открывается, а с операторским — нет, виноват кэш оператора
(подождать или сменить сеть).

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

Статика открывается с Timeweb. Кабинет из браузера ходит на `*.supabase.co`.

**Не включать SSR на текущем Frontend** — будет 404.

### Шлюз (`sb.uniquevocal.ru`)

Амстердамский VPS (`147.45.136.24`) с VPN открывается, **без VPN из РФ —
нет** (TSPU). Публичный вход — московский VPS: **A `sb` → `5.42.123.142`**. Инструкция:
`deploy/sb-proxy/README.md`.

Пока `https://sb.uniquevocal.ru/__health` не отвечает `ok` **без VPN**,
переменную `NEXT_PUBLIC_SUPABASE_PROXY_URL` в сборке не считать рабочей.

Оплата сейчас работает в явно обозначенном Beta/sandbox-режиме: операция
записывается в `payment_transactions`, но деньги не списываются. Выдачу
боевого доступа позднее необходимо переключить на подтверждённый webhook
платёжного провайдера.
