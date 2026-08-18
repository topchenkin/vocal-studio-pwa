# Шлюз Supabase

Ученики в РФ не ходят на `*.supabase.co` (Cloudflare / TSPU).
Браузер должен бить в **российский IP Timeweb** (`92.246.76.92`), тот же,
что и сайт. Амстердам (`147.45.136.24`) доходит **только с VPN** — как
вход для учеников он не подходит.

```
ученик (РФ) → https://sb.uniquevocal.ru   (IP 92.246.76.92, Timeweb Apps)
            → Node sb-proxy в РФ
            → https://<проект>.supabase.co
              (если из РФ не достучаться — через VPS в Амстердаме)
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

A-запись **sb** должна смотреть на сайт, не на Амстердам:

| Имя | Тип | Значение |
|-----|-----|----------|
| `sb` | A | `92.246.76.92` |

`@` и `www` не меняйте (тоже `92.246.76.92`).

Проверка **без VPN**:

```text
nslookup sb.uniquevocal.ru 8.8.8.8
```

Нужно `92.246.76.92`. Затем в браузере без VPN:
`https://sb.uniquevocal.ru/__health` → `ok`.

### 3. Frontend UniqueVocal

Когда health без VPN = `ok`:

`NEXT_PUBLIC_SUPABASE_PROXY_URL` = `https://sb.uniquevocal.ru`

Пересобрать Frontend.

## Амстердамский VPS (не публичный вход)

`147.45.136.24` оставляем как запасной origin. Ученики туда больше не ходят.
Инструкция установки Caddy+Node на VPS: `install.sh` (SSH).

## Supabase Dashboard

Redirect URLs: `https://www.uniquevocal.ru`, `https://www.uniquevocal.ru/**`.
