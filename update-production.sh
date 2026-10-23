#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
[ -f .env.production ] || { echo "Missing .env.production"; exit 1; }
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build --remove-orphans
docker compose --env-file .env.production -f docker-compose.production.yml ps
