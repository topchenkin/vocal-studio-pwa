#!/bin/bash
set -e
iptables -C INPUT -p tcp --dport 5432 ! -i lo -j DROP 2>/dev/null || iptables -I INPUT -p tcp --dport 5432 ! -i lo -j DROP
iptables -C INPUT -p tcp --dport 6543 ! -i lo -j DROP 2>/dev/null || iptables -I INPUT -p tcp --dport 6543 ! -i lo -j DROP
echo APPLY_SCHEMA
docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=0 < /opt/uvs-migrate/schema.sql > /opt/uvs-migrate/schema.log 2>&1
for f in /opt/uvs-migrate/migrations/*.sql; do
  echo "MIG $f"
  docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=0 < "$f" >> /opt/uvs-migrate/schema.log 2>&1
done
echo SCHEMA_DONE
export LOCAL_URL=http://127.0.0.1:8000
export SERVICE_ROLE_KEY="$(grep '^SERVICE_ROLE_KEY=' /opt/supabase/.env | cut -d= -f2-)"
export DUMP_DIR=/opt/uvs-migrate
node /opt/uvs-migrate/restore-local.mjs
echo RESTORE_DONE
