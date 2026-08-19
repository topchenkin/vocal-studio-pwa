# Шлюз Supabase

Ученики в РФ не ходят на `*.supabase.co` (Cloudflare / TSPU).
Браузер должен бить в **московский VPS** (`5.42.123.142`) — тот же IP, что
и сайт. Амстердам (`147.45.136.24`) доходит **только с VPN** — как вход
для учеников он не подходит.

```
ученик (РФ) → https://sb.uniquevocal.ru   (IP 5.42.123.142, VPS Москва)
            → Node sb-proxy
            → https://<проект>.supabase.co
```

## Боевой запуск (без VPN)

### 1. Timeweb Cloud Apps — второе приложение (Node, не Frontend)

Не трогайте UniqueVocal Frontend (статика сайта).

1. Apps → **Создать** → **Node.js** (или Docker).
2. Репозиторий тот же: `topchenkin/vocal-studio-pwa`.
3. Регион / площадка — **Россия** (как у сайта), не Amsterdam.
4. Команда запуска (не `npm start` — это Next.js):

```text
node deploy/sb-proxy/server.mjs
```

Для Docker: контекст `deploy/sb-proxy`, файл `Dockerfile`.

5. Переменные этого приложения:

```text
SUPABASE_ORIGIN=https://aeycfifglscmkotdpwiu.supabase.co
PROXY_PUBLIC_ORIGIN=https://sb.uniquevocal.ru
ALLOW_ORIGIN=https://www.uniquevocal.ru
BIND=0.0.0.0
```

`PORT` Timeweb подставит сам.

6. Домен приложения: **sb.uniquevocal.ru**.
7. Сборка/деплой этого Node-приложения.

Если из контейнера в РФ `supabase.co` не открывается, замените:

```text
SUPABASE_ORIGIN=http://147.45.136.24
```

(VPS в Амстердаме уже проксирует на Supabase; из датацентра Timeweb до него
обычно есть путь.)

### 2. DNS (reg.ru)

A-записи сайта и шлюза смотрят на московский VPS, не на Амстердам и не на
Frontend Apps (`92.246.76.92` — там Caddy отдаёт HTML вместо JS):

| Имя | Тип | Значение |
|-----|-----|----------|
| `@` | A | `5.42.123.142` |
| `www` | A | `5.42.123.142` |
| `sb` | A | `5.42.123.142` |

В корне репозитория **не** должно быть `Caddyfile`: App Platform Frontend
подхватывает его и ломает статику. Боевой Caddy — `deploy/sb-proxy/Caddyfile`
на VPS (статика + `sb` reverse_proxy).

Проверка **без VPN**:

```text
nslookup sb.uniquevocal.ru 8.8.8.8
```

Нужно `5.42.123.142`. Затем в браузере без VPN:
`https://sb.uniquevocal.ru/__health` → `ok`.

### 3. Сборка сайта на VPS

Статику собирают локально (`NEXT_PUBLIC_SUPABASE_PROXY_URL=https://sb.uniquevocal.ru npm run build`)
и заливают в `/var/www/uniquevocal` скриптом `scripts/deploy-site-vps.py`.
Timeweb Frontend UniqueVocal больше не публикует сайт.

## Амстердамский VPS (не публичный вход)

`147.45.136.24` оставляем как запасной origin. Ученики туда больше не ходят.
Инструкция установки Caddy+Node на VPS: `install.sh` (SSH).

## Supabase Dashboard

Redirect URLs: `https://www.uniquevocal.ru`, `https://www.uniquevocal.ru/**`.
