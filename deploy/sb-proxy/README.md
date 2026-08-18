# Шлюз Supabase (VPS в ЕС)

Ученики в РФ не ходят на `*.supabase.co` (Cloudflare часто режется).
Браузер бьёт в `https://sb.uniquevocal.ru`, а сервер в Амстердаме уже
нормально достаёт Supabase.

```
ученик (РФ) → https://sb.uniquevocal.ru  (Caddy, TLS)
            → 127.0.0.1:8787            (этот Node)
            → https://<проект>.supabase.co
```

Боевой IP шлюза: `147.45.136.24` (Timeweb Cloud, Amsterdam).
Сайт `www.uniquevocal.ru` остаётся на Timeweb Frontend (`92.246.76.92`).

## 1. DNS (reg.ru)

A-запись:

- имя: `sb`
- тип: **A**
- значение: `147.45.136.24`

Не ставьте CNAME на GitHub и не направляйте `sb` на IP сайта.

Проверка: `nslookup sb.uniquevocal.ru 8.8.8.8` → `147.45.136.24`.

## 2. Firewall в панели Timeweb

Откройте входящие **22**, **80**, **443**. Без 80/443 сертификат Let's Encrypt
не выпустится.

## 3. Установка на VPS

С машины, где есть SSH (репозиторий можно не клонировать, если он private):

```bash
scp -r deploy/sb-proxy root@147.45.136.24:/root/sb-proxy
ssh root@147.45.136.24 'bash /root/sb-proxy/install.sh'
```

Проверки:

```bash
curl -fsS http://127.0.0.1:8787/__health
curl -fsS https://sb.uniquevocal.ru/__health
curl -fsS https://sb.uniquevocal.ru/auth/v1/health
```

## 4. Сборка сайта на Timeweb

Когда `https://sb.uniquevocal.ru/__health` отвечает `ok` **без VPN**:

Timeweb → UniqueVocal → переменные:

- `NEXT_PUBLIC_SUPABASE_URL` — как сейчас, `https://….supabase.co`
- `NEXT_PUBLIC_SUPABASE_PROXY_URL` = `https://sb.uniquevocal.ru`

Пересобрать Frontend. Пока шлюз не жив, переменную **не** ставить — логин
уйдёт в 404.

## 5. Supabase Dashboard

Authentication → URL Configuration → Redirect URLs:

- `https://www.uniquevocal.ru`
- `https://www.uniquevocal.ru/**`
- `https://sb.uniquevocal.ru` (по необходимости)

Service role через этот шлюз не публикуйте — Node только пересылает то,
что прислал браузер (anon key).

---

### Запасной вариант: ПК с BlancVPN

Если VPS ещё не куплен, прокси можно крутить на домашнем ПК с TUN BlancVPN
и Cloudflare Tunnel. Это хуже (ПК должен быть включён). Для Windows:

```powershell
$env:SUPABASE_ORIGIN = "https://ВАШ_ПРОЕКТ.supabase.co"
$env:PROXY_PUBLIC_ORIGIN = "https://sb.uniquevocal.ru"
$env:ALLOW_ORIGIN = "https://www.uniquevocal.ru"
$env:BIND = "127.0.0.1"
$env:PORT = "8787"
node deploy/sb-proxy/server.mjs
```
