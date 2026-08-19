#!/usr/bin/env bash
# Run as root on the Moscow VPS after DNS A sb.uniquevocal.ru → this IP.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPABASE_ORIGIN="${SUPABASE_ORIGIN:-https://aeycfifglscmkotdpwiu.supabase.co}"
PROXY_PUBLIC_ORIGIN="${PROXY_PUBLIC_ORIGIN:-https://sb.uniquevocal.ru}"
ALLOW_ORIGIN="${ALLOW_ORIGIN:-https://www.uniquevocal.ru}"

apt-get update
apt-get install -y ca-certificates curl gnupg debian-keyring debian-archive-keyring apt-transport-https ufw

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! command -v caddy >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update
  apt-get install -y caddy
fi

mkdir -p /opt/sb-proxy /etc/uniquevocal
install -m 644 "$SCRIPT_DIR/server.mjs" /opt/sb-proxy/server.mjs
chown -R www-data:www-data /opt/sb-proxy

cat >/etc/uniquevocal/sb-proxy.env <<EOF
SUPABASE_ORIGIN=${SUPABASE_ORIGIN}
PROXY_PUBLIC_ORIGIN=${PROXY_PUBLIC_ORIGIN}
ALLOW_ORIGIN=${ALLOW_ORIGIN}
BIND=127.0.0.1
PORT=8787
EOF
chmod 640 /etc/uniquevocal/sb-proxy.env

install -m 644 "$SCRIPT_DIR/sb-proxy.service" /etc/systemd/system/sb-proxy.service
install -m 644 "$SCRIPT_DIR/Caddyfile" /etc/caddy/Caddyfile

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

systemctl daemon-reload
systemctl enable --now sb-proxy
systemctl enable --now caddy
systemctl reload caddy || systemctl restart caddy

echo
echo "Proxy listening on 127.0.0.1:8787"
echo "HTTPS: ${PROXY_PUBLIC_ORIGIN}  (needs DNS A → this server)"
echo "Health: curl -fsS ${PROXY_PUBLIC_ORIGIN}/__health"
echo "Supabase: curl -fsS ${PROXY_PUBLIC_ORIGIN}/auth/v1/health"
