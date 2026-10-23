#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
POSTGRES_USER=$(sed -n 's/^POSTGRES_USER=//p' .env.production | head -n1)
POSTGRES_DB=$(sed -n 's/^POSTGRES_DB=//p' .env.production | head -n1)
POSTGRES_USER=${POSTGRES_USER:-bicar}
POSTGRES_DB=${POSTGRES_DB:-bicar_parts}
mkdir -p backups
STAMP=$(date +%Y%m%d-%H%M%S)
docker compose --env-file .env.production -f docker-compose.production.yml exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "backups/bicar-$STAMP.sql.gz"
docker compose --env-file .env.production -f docker-compose.production.yml exec -T app tar -czf - -C /app uploads > "backups/bicar-uploads-$STAMP.tar.gz"
echo "DB backup: backups/bicar-$STAMP.sql.gz"
echo "Uploads backup: backups/bicar-uploads-$STAMP.tar.gz"
