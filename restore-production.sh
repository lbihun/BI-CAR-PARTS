#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
[ -f .env.production ] || { echo "Missing .env.production"; exit 1; }
[ $# -ge 1 ] || { echo "Usage: ./restore-production.sh backups/bicar-YYYYMMDD-HHMMSS.sql.gz [uploads.tar.gz]"; exit 1; }
DBFILE=$1
POSTGRES_USER=$(sed -n 's/^POSTGRES_USER=//p' .env.production | head -n1); POSTGRES_USER=${POSTGRES_USER:-bicar}
POSTGRES_DB=$(sed -n 's/^POSTGRES_DB=//p' .env.production | head -n1); POSTGRES_DB=${POSTGRES_DB:-bicar_parts}
COMPOSE="docker compose --env-file .env.production -f docker-compose.production.yml"
$COMPOSE up -d db
printf "Restore database from %s? Type RESTORE: " "$DBFILE"; read OK
[ "$OK" = "RESTORE" ] || { echo "Cancelled"; exit 1; }
gzip -dc "$DBFILE" | $COMPOSE exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
if [ $# -ge 2 ]; then
  UPFILE=$2
  cat "$UPFILE" | $COMPOSE exec -T app tar -xzf - -C /app
fi
$COMPOSE restart app
echo "Restore completed"
