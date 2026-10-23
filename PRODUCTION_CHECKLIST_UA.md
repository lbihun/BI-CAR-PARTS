# BI-CAR PARTS v72 — Production checklist

1. DNS `A` для домену вказує на IP VPS.
2. Firewall дозволяє TCP 22, 80, 443 та UDP 443; PostgreSQL 5432 назовні НЕ відкривати.
3. Запустити `./deploy-production.sh`.
4. Перевірити `https://DOMAIN/api/health` — `ok: true`, version 72.
5. Увійти в Admin production-паролем.
6. Перевірити чат у двох браузерах: online/offline, typing, unread, файл, звук.
7. Увімкнути AutoPartsAPI і перевірити VIN `WDBFA68F42F202731`.
8. Перевірити VIN gate: авто видно без входу; категорії — після реєстрації/входу.
9. Оформити тестове замовлення; перевірити PostgreSQL та Telegram/email/push.
10. Натиснути «Увімкнути push + звук» в адмінці і дозволити Notification.
11. Виконати `./backup-production.sh` і перевірити, що створився `.sql.gz`.
12. Не зберігати `.env.production` у Git/публічному архіві.
