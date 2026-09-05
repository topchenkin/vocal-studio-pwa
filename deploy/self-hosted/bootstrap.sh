#!/bin/sh
exec >> /opt/uvs-migrate/bootstrap.log 2>&1
echo "bootstrap start $(date -Is)"
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "run as root"
  exit 1
fi

if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi
swapon /swapfile 2>/dev/null || true

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

mkdir -p /opt /opt/uvs-migrate
if [ ! -d /opt/supabase ]; then
  rm -rf /tmp/supabase-src
  git clone --depth 1 --filter=blob:none --sparse https://github.com/supabase/supabase.git /tmp/supabase-src
  cd /tmp/supabase-src
  git sparse-checkout set docker
  mv docker /opt/supabase
  cd /
  rm -rf /tmp/supabase-src
fi

cd /opt/supabase
if [ ! -f .env ]; then
  cp .env.example .env
  sh utils/generate-keys.sh --update-env
fi

sed -i \
  -e 's|^SUPABASE_PUBLIC_URL=.*|SUPABASE_PUBLIC_URL=https://sb.uniquevocal.ru|' \
  -e 's|^API_EXTERNAL_URL=.*|API_EXTERNAL_URL=https://sb.uniquevocal.ru/auth/v1|' \
  -e 's|^SITE_URL=.*|SITE_URL=https://www.uniquevocal.ru|' \
  -e 's|^ADDITIONAL_REDIRECT_URLS=.*|ADDITIONAL_REDIRECT_URLS=https://www.uniquevocal.ru,https://www.uniquevocal.ru/auth/reset,https://uniquevocal.ru,https://uniquevocal.ru/auth/reset,https://sb.uniquevocal.ru|' \
  -e 's|^ENABLE_EMAIL_AUTOCONFIRM=.*|ENABLE_EMAIL_AUTOCONFIRM=true|' \
  -e 's|^API_GW_HTTP_PORT=.*|API_GW_HTTP_PORT=127.0.0.1:8000|' \
  -e 's|^KONG_HTTP_PORT=.*|KONG_HTTP_PORT=127.0.0.1:8000|' \
  .env

docker compose pull
docker compose up -d
docker compose ps
