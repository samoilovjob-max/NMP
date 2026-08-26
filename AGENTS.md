# Northern Magical Place

Премиальный сайт карельских костровых систем Flat-Pack + заказ через СДЭК / ЮKassa.

## Cursor Cloud

- Node.js-приложение: `npm install && npm start` → http://localhost:3000
- Не открывайте HTML через `file://` — нужен HTTP-сервер из `npm start`
- Секреты и ключи — в `.env` (скопируйте из `.env.example`); файл `.env` не коммитить
- Подпроекты лежат в `projects/` и отдаются тем же сервером, например `/projects/novyy-proekt/`
- Линтеров и автотестов в репозитории нет; проверка — ручной прогон в браузере
- Документация: `docs/UPRAVLENIE-SAJTOM.md`, `docs/DEPLOY-NORTHMP-BEGET.md`
