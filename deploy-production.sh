#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
COMPOSE="docker compose --env-file .env.production -f docker-compose.production.yml"

need(){ command -v "$1" >/dev/null 2>&1 || { echo "ERROR: $1 is not installed"; exit 1; }; }
need docker
if ! docker info >/dev/null 2>&1; then echo "ERROR: Docker Engine is not running"; exit 1; fi

if [ ! -f .env.production ]; then
  echo "=== BI-CAR PARTS v72 first production setup ==="
  printf "Domain (example: bicarparts.com.ua): "; read DOMAIN
  [ -n "$DOMAIN" ] || { echo "Domain is required"; exit 1; }
  echo "$DOMAIN" | grep -Eq '^[A-Za-z0-9.-]+$' || { echo "Enter domain only, without https:// or path"; exit 1; }

  printf "Admin login [admin]: "; read ADMIN_LOGIN; ADMIN_LOGIN=${ADMIN_LOGIN:-admin}
  printf "Admin password [Enter = generate automatically]: ";
  if [ -t 0 ]; then stty -echo; trap 'stty echo' EXIT INT TERM; read ADMIN_PASSWORD; stty echo; trap - EXIT INT TERM; echo; else read ADMIN_PASSWORD; fi
  if [ -z "$ADMIN_PASSWORD" ]; then ADMIN_PASSWORD=$(openssl rand -hex 12 2>/dev/null || date +%s%N | sha256sum | cut -c1-24); ADMIN_PASSWORD_GENERATED=true; else ADMIN_PASSWORD_GENERATED=false; fi
  [ ${#ADMIN_PASSWORD} -ge 10 ] || { echo "Admin password too short"; exit 1; }
  echo "$ADMIN_PASSWORD" | grep -Eq '^[A-Za-z0-9@%+=_:.,!-]+$' || { echo "For .env safety use letters, numbers and @%+=_:.,!- only"; exit 1; }

  printf "AutoPartsAPI key [Enter = configure later]: "; read AUTOPARTSAPI_KEY
  if [ -n "$AUTOPARTSAPI_KEY" ]; then AUTOPARTSAPI_ENABLED=true; else AUTOPARTSAPI_ENABLED=false; fi

  TELEGRAM_ENABLED=false; TELEGRAM_BOT_TOKEN=''; TELEGRAM_CHAT_ID=''
  printf "Configure Telegram notifications now? [y/N]: "; read TGY
  case "$TGY" in y|Y|yes|YES)
    printf "Telegram bot token: "; read TELEGRAM_BOT_TOKEN
    printf "Telegram chat ID: "; read TELEGRAM_CHAT_ID
    if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then TELEGRAM_ENABLED=true; fi
  esac

  EMAIL_ENABLED=false; SMTP_USER='bicarparts2026@gmail.com'; SMTP_PASS=''; NOTIFY_EMAIL_TO='bicarparts2026@gmail.com'
  printf "Configure email notifications now? [y/N]: "; read EMY
  case "$EMY" in y|Y|yes|YES)
    printf "SMTP/Gmail user [$SMTP_USER]: "; read EUSER; SMTP_USER=${EUSER:-$SMTP_USER}
    printf "Gmail App Password (spaces will be removed): ";
    if [ -t 0 ]; then stty -echo; trap 'stty echo' EXIT INT TERM; read SMTP_PASS; stty echo; trap - EXIT INT TERM; echo; else read SMTP_PASS; fi
    SMTP_PASS=$(printf '%s' "$SMTP_PASS" | tr -d ' ')
    printf "Notification email [$SMTP_USER]: "; read ETO; NOTIFY_EMAIL_TO=${ETO:-$SMTP_USER}
    if [ -n "$SMTP_PASS" ]; then EMAIL_ENABLED=true; fi
  esac

  POSTGRES_PASSWORD=$(openssl rand -hex 24 2>/dev/null || date +%s%N | sha256sum | cut -c1-48)
  JWT_SECRET=$(openssl rand -hex 48 2>/dev/null || date +%s%N | sha256sum | cut -c1-64)
  cat > .env.production <<EOF
DOMAIN=$DOMAIN
POSTGRES_DB=bicar_parts
POSTGRES_USER=bicar
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
DATABASE_URL=postgres://bicar:$POSTGRES_PASSWORD@db:5432/bicar_parts
JWT_SECRET=$JWT_SECRET
ADMIN_LOGIN=$ADMIN_LOGIN
ADMIN_PASSWORD=$ADMIN_PASSWORD
ADMIN_NAME="Власник BI-CAR PARTS"
CORS_ORIGIN=https://$DOMAIN
NODE_ENV=production
PORT=3000
UPLOAD_DIR=/app/uploads
AUTOPARTSAPI_ENABLED=$AUTOPARTSAPI_ENABLED
AUTOPARTSAPI_BASE_URL=https://auto-parts-catalog.apiprofile.com
AUTOPARTSAPI_KEY=$AUTOPARTSAPI_KEY
AUTOPARTSAPI_TYPE_ID=1
AUTOPARTSAPI_LANG_ID=4
AUTOPARTSAPI_TIMEOUT_MS=15000
TELEGRAM_ENABLED=$TELEGRAM_ENABLED
TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID=$TELEGRAM_CHAT_ID
EMAIL_ENABLED=$EMAIL_ENABLED
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=$SMTP_USER
SMTP_PASS=$SMTP_PASS
NOTIFY_EMAIL_FROM="BI-CAR PARTS <$SMTP_USER>"
NOTIFY_EMAIL_TO=$NOTIFY_EMAIL_TO
WEBPUSH_ENABLED=true
VAPID_SUBJECT=mailto:$NOTIFY_EMAIL_TO
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
CHAT_MAX_FILE_MB=10
CHAT_OFFLINE_MESSAGE="Дякуємо за повідомлення! Зараз менеджер офлайн. Ми відповімо вам найближчим часом."
EOF
  chmod 600 .env.production
  echo "Building app image..."
  $COMPOSE build app
  echo "Generating VAPID keys..."
  KEYS=$($COMPOSE run --rm --no-deps app node -e "const w=require('web-push').generateVAPIDKeys();console.log(w.publicKey);console.log(w.privateKey)")
  PUB=$(printf '%s\n' "$KEYS" | tail -n 2 | head -n 1)
  PRIV=$(printf '%s\n' "$KEYS" | tail -n 1)
  [ -n "$PUB" ] && [ -n "$PRIV" ] || { echo "ERROR: VAPID key generation failed"; exit 1; }
  sed -i "s|^VAPID_PUBLIC_KEY=.*|VAPID_PUBLIC_KEY=$PUB|" .env.production
  sed -i "s|^VAPID_PRIVATE_KEY=.*|VAPID_PRIVATE_KEY=$PRIV|" .env.production
  echo "Created .env.production (permissions 600)."
  if [ "$ADMIN_PASSWORD_GENERATED" = true ]; then echo "IMPORTANT — generated admin password: $ADMIN_PASSWORD"; fi
fi
echo "Validating compose config..."
$COMPOSE config >/dev/null

echo "Starting BI-CAR PARTS..."
$COMPOSE up -d --build --remove-orphans

echo "Waiting for app health..."
i=0
while [ $i -lt 30 ]; do
  if $COMPOSE exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then break; fi
  i=$((i+1)); sleep 2
done
if [ $i -ge 30 ]; then echo "ERROR: app did not become healthy"; $COMPOSE logs --tail=120 app db; exit 1; fi

echo "=== DEPLOYED ==="
DOMAIN_OUT=$(sed -n 's/^DOMAIN=//p' .env.production | head -n1)
ADMIN_LOGIN_OUT=$(sed -n 's/^ADMIN_LOGIN=//p' .env.production | head -n1)
echo "Site: https://$DOMAIN_OUT"
echo "Health (inside): OK"
echo "Admin login: $ADMIN_LOGIN_OUT"
if command -v curl >/dev/null 2>&1; then
  echo "Checking public HTTPS..."
  if curl -fsS --max-time 15 "https://$DOMAIN_OUT/api/health" >/dev/null 2>&1; then echo "Public HTTPS: OK"; else echo "Public HTTPS not ready yet. Check DNS and ports 80/443; Caddy may still be obtaining the certificate."; fi
fi
echo "Use: $COMPOSE logs -f app caddy"
