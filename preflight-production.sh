#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
[ -f .env.production ] || { echo "Missing .env.production — run ./deploy-production.sh first"; exit 1; }
COMPOSE="docker compose --env-file .env.production -f docker-compose.production.yml"
for k in DOMAIN POSTGRES_PASSWORD JWT_SECRET ADMIN_LOGIN ADMIN_PASSWORD CORS_ORIGIN; do
  v=$(sed -n "s/^$k=//p" .env.production | head -n1)
  [ -n "$v" ] || { echo "Missing $k"; exit 1; }
done
DOMAIN=$(sed -n 's/^DOMAIN=//p' .env.production | head -n1)
CORS=$(sed -n 's/^CORS_ORIGIN=//p' .env.production | head -n1)
[ "$CORS" = "https://$DOMAIN" ] || { echo "CORS_ORIGIN should be https://$DOMAIN"; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker Engine is not running"; exit 1; }
$COMPOSE config >/dev/null
echo "Compose config: OK"
echo "Domain/CORS: OK"
if grep -qE 'CHANGE_ME|GENERATED_BY_DEPLOY_SCRIPT' .env.production; then echo "Placeholder found in .env.production"; exit 1; fi
if [ "$(sed -n 's/^AUTOPARTSAPI_ENABLED=//p' .env.production | head -n1)" = "true" ] && [ -z "$(sed -n 's/^AUTOPARTSAPI_KEY=//p' .env.production | head -n1)" ]; then echo "AutoPartsAPI enabled but key missing"; exit 1; fi
if [ "$(sed -n 's/^WEBPUSH_ENABLED=//p' .env.production | head -n1)" = "true" ]; then
  [ -n "$(sed -n 's/^VAPID_PUBLIC_KEY=//p' .env.production | head -n1)" ] || { echo "VAPID_PUBLIC_KEY missing"; exit 1; }
  [ -n "$(sed -n 's/^VAPID_PRIVATE_KEY=//p' .env.production | head -n1)" ] || { echo "VAPID_PRIVATE_KEY missing"; exit 1; }
fi
echo "Production preflight: OK"
