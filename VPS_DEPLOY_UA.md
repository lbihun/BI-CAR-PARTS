# BI-CAR PARTS v72 — розміщення на VPS

Потрібні Ubuntu 22.04/24.04, домен з A-записом на IP VPS, відкриті TCP 80/443 та встановлені Docker Engine + Docker Compose plugin.

Завантажте всю папку проєкту, наприклад у `/opt/bicarparts`, після чого:

```bash
cd /opt/bicarparts
chmod +x deploy-production.sh
./deploy-production.sh
```

Це основна команда першого запуску. Скрипт попросить домен, admin login/password та за бажанням AutoPartsAPI, Telegram і SMTP. PostgreSQL password, JWT secret і VAPID keys генеруються автоматично.

Перевірка:

```bash
docker compose -f docker-compose.production.yml --env-file .env.production ps
curl -fsS https://ВАШ_ДОМЕН/api/health
```

Оновлення:

```bash
./update-production.sh
```

Backup:

```bash
./backup-production.sh
```

Restore:

```bash
./restore-production.sh шлях_до_backup.tar.gz
```

Логи:

```bash
docker compose -f docker-compose.production.yml --env-file .env.production logs -f app
docker compose -f docker-compose.production.yml --env-file .env.production logs -f caddy
```
