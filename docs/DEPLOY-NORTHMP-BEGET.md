# Размещение сайта Northern Magical Place на northmp.su (Beget)

Пошаговая инструкция для домена **northmp.su**, зарегистрированного и обслуживаемого в **Beget**.

Сайт — это **Node.js-приложение** (Express), а не статическая страница Tilda. Ему нужен **VPS** с постоянно работающим процессом `node server/index.js`.

> **Важно:** обычный виртуальный хостинг Beget (PHP/HTML) **не подходит** — там нельзя нормально держать Node-сервер, заказы, админку и webhook ЮKassa.

---

## Что вы получите в итоге

```
Посетитель → northmp.su (DNS Beget) → [опционально DDoS-Guard] → nginx (HTTPS) → Node.js :3000
```

- Витрина: `https://northmp.su/`
- Админка: `https://northmp.su/admin.html`
- API / webhook: `https://northmp.su/api/...`

---

## Текущая ситуация (на момент подготовки инструкции)

Домен `northmp.su` сейчас отдаёт **страницу Tilda** («Domain has been assigned») через **DDoS-Guard**.  
Наше приложение на прод **не выкладывалось** — нужно переключить домен на VPS.

---

## Что понадобится

| Ресурс | Зачем |
|--------|-------|
| **Beget VPS** (Ubuntu 22.04/24.04) | Сервер для Node.js, min. 1 GB RAM |
| Доступ SSH к VPS | Установка и обновления |
| Панель Beget → **Домены и DNS** | A-запись на IP VPS |
| Репозиторий GitHub `samoilovjob-max/NMP` | Код сайта |
| Файл `.env` с ключами | СДЭК, ЮKassa, админка, Telegram, Метрика |
| Доступ к кабинетам ЮKassa, СДЭК, Tilda | Webhook и отвязка домена |

**Рекомендуемая ветка для деплоя:** `main` (после merge PR) или актуальная feature-ветка с последними правками.

---

## Часть 1. VPS в Beget

### 1.1. Заказ VPS (если ещё нет)

1. Войти в [cp.beget.com](https://cp.beget.com/)
2. **Облако → VPS** (или «Виртуальные серверы»)
3. Создать сервер:
   - **ОС:** Ubuntu 22.04 LTS или 24.04 LTS
   - **RAM:** от 1 GB (лучше 2 GB — для `sharp` и сборки)
   - **Диск:** от 10 GB
4. Записать:
   - **IP-адрес VPS** (например `185.xxx.xxx.xxx`)
   - **Логин/пароль root** или SSH-ключ

### 1.2. Первый вход по SSH

С вашего компьютера:

```bash
ssh root@185.xxx.xxx.xxx
```

(подставьте IP VPS из панели Beget)

Обновить систему:

```bash
apt update && apt upgrade -y
apt install -y curl git nginx ufw
```

### 1.3. Установка Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v    # v20.x
npm -v
```

### 1.4. PM2 — автозапуск приложения

```bash
npm install -g pm2
```

---

## Часть 2. Код и настройки на VPS

### 2.1. Клонирование проекта

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/samoilovjob-max/NMP.git nmp
cd nmp
```

Если деплой с feature-ветки до merge:

```bash
git fetch origin
git checkout cursor/northern-magical-place-landing-5097
```

### 2.2. Зависимости

```bash
cd /var/www/nmp
npm install --omit=dev
```

> `sharp` может собираться 1–3 минуты — это нормально.

### 2.3. Файл `.env`

```bash
cp .env.example .env
nano .env
```

Заполните **все** боевые значения. Минимальный чеклист:

```env
# Публичный адрес сайта — обязательно HTTPS и без слэша в конце
PUBLIC_BASE_URL=https://northmp.su
PORT=3000

# Админка
ADMIN_USER=ваш_логин
ADMIN_PASSWORD=длинный_сложный_пароль
ADMIN_TOKEN=случайная_длинная_строка_сессии

# СДЭК
CDEK_ACCOUNT=...
CDEK_SECURE=...
CDEK_FROM_CITY=Петрозаводск
CDEK_FROM_CITY_CODE=450
CDEK_FROM_ADDRESS=Лесной проспект 47
PICKUP_ADDRESS=г. Петрозаводск, ул. Университетская 7/3

# ЮKassa (боевой режим)
YOOKASSA_SHOP_ID=1420560
YOOKASSA_SECRET_KEY=live_...
PAYMENTS_DEMO=false
YOOKASSA_SEND_RECEIPT=true
YOOKASSA_VAT_CODE=1

# Яндекс.Метрика
YANDEX_METRICA_ID=111658498
ANALYTICS_REQUIRE_CONSENT=true

# Telegram (опционально)
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...

# Габариты посылки по умолчанию
PACKAGE_WEIGHT=8000
PACKAGE_LENGTH=60
PACKAGE_WIDTH=40
PACKAGE_HEIGHT=10
SHIP_SLA_HOURS=48
```

Права на `.env`:

```bash
chmod 600 /var/www/nmp/.env
```

### 2.4. Данные CMS и заказов

При **первом** запуске создаётся `server/data/cms.json` из `server/cms-seed.json`.

Если переносите с уже работавшего стенда — **скопируйте на VPS**:

| С VPS / стенда | Куда на сервере |
|----------------|-----------------|
| `server/data/` | `/var/www/nmp/server/data/` |
| `images/uploads/` | `/var/www/nmp/images/uploads/` |

```bash
# пример с вашего компьютера (scp)
scp -r server/data root@185.xxx.xxx.xxx:/var/www/nmp/server/
scp -r images/uploads root@185.xxx.xxx.xxx:/var/www/nmp/images/
```

### 2.5. Запуск через PM2

```bash
cd /var/www/nmp
pm2 start server/index.js --name nmp
pm2 save
pm2 startup
```

Выполните команду, которую выведет `pm2 startup` (с `sudo env ...`).

Проверка на самом VPS:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
# ожидается: 200

curl -s http://127.0.0.1:3000/api/health | head -c 200
# ожидается: {"ok":true,...}
```

Логи:

```bash
pm2 logs nmp
pm2 status
```

---

## Часть 3. nginx и HTTPS

### 3.1. Конфиг nginx

```bash
nano /etc/nginx/sites-available/northmp.su
```

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name northmp.su www.northmp.su;

    # Let's Encrypt verification
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        client_max_body_size 12m;
    }
}
```

```bash
mkdir -p /var/www/certbot
ln -sf /etc/nginx/sites-available/northmp.su /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

### 3.2. SSL-сертификат (Let's Encrypt)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d northmp.su -d www.northmp.su
```

Согласиться с условиями, указать email для продления.

Канонический хост — **без www**. После выпуска сертификата добавьте отдельный server-блок, чтобы `www.northmp.su` сразу отдавал 301, а не 200:

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name www.northmp.su;
    ssl_certificate /etc/letsencrypt/live/northmp.su/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/northmp.su/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    return 301 https://northmp.su$request_uri;
}
```

В блоке `northmp.su` оставьте только `server_name northmp.su;`. Приложение также делает этот редирект само, если запрос всё же дошёл до Node.

Автопродление проверить:

```bash
certbot renew --dry-run
```

### 3.3. Firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
ufw status
```

---

## Часть 4. DNS в Beget

### 4.1. Отключить Tilda

1. Зайти в [tilda.cc](https://tilda.cc/) → проект, к которому привязан `northmp.su`
2. **Настройки сайта → Домен** → **отвязать** `northmp.su` или удалить привязку
3. Иначе при смене DNS может оставаться заглушка Tilda

### 4.2. DDoS-Guard (если используется)

По проверке домен шёл через **DDoS-Guard**. Два варианта:

**Вариант A — оставить DDoS-Guard**

1. Панель [DDoS-Guard](https://ddos-guard.net/) → сайт `northmp.su`
2. **Проксирование / Origin** → указать **IP вашего VPS Beget**
3. В Beget DNS NS часто остаются на DDoS-Guard — **не меняйте A-запись в Beget**, если NS делегированы на DDoS-Guard

**Вариант B — без DDoS-Guard (проще)**

1. В Beget: **Домены → northmp.su → DNS**
2. Убедиться, что NS — **Beget** (не DDoS-Guard)
3. Создать/изменить записи:

| Тип | Имя | Значение | TTL |
|-----|-----|----------|-----|
| **A** | `@` | `IP_вашего_VPS` | 300–3600 |
| **A** | `www` | `IP_вашего_VPS` | 300–3600 |

4. Удалить лишние A/CNAME, ведущие на Tilda или сторонние IP

### 4.3. Где менять DNS в Beget

1. [cp.beget.com](https://cp.beget.com/)
2. **Домены и поддомены**
3. **northmp.su** → **Редактировать DNS** (или «Управление зоной»)
4. Сохранить → подождать **15 мин – 24 ч** (обычно 15–60 мин)

Проверка с VPS или ПК:

```bash
dig northmp.su +short
dig www.northmp.su +short
# должен быть IP VPS (или IP DDoS-Guard, если прокси включён)
```

---

## Часть 5. Настройка после выкладки

### 5.1. ЮKassa

1. [yookassa.ru](https://yookassa.ru/) → Настройки → **HTTP-уведомления**
2. URL: `https://northmp.su/api/payments/webhook`
3. События: `payment.succeeded`, `payment.canceled`
4. В `.env` на сервере: `PUBLIC_BASE_URL=https://northmp.su`, `PAYMENTS_DEMO=false`

Тест: оформить заказ → оплатить → статус «оплачен» в админке и личном кабинете.

### 5.2. Яндекс.Метрика

1. [metrika.yandex.ru](https://metrika.yandex.ru/) → счётчик **111658498**
2. Адрес сайта: `https://northmp.su`
3. На сайте после «Принять» в баннере cookies — в Network должен быть запрос к `mc.yandex.ru`

### 5.3. Поисковики

После деплоя проверить:

- `https://northmp.su/robots.txt`
- `https://northmp.su/sitemap.xml`

В [Яндекс.Вебмастер](https://webmaster.yandex.ru/) и Google Search Console добавить сайт и отправить sitemap.

### 5.4. Почта info@northmp.su

Почтовый ящик настраивается **отдельно** в Beget (раздел «Почта»), не через Node-приложение.

---

## Часть 6. Чеклист «сайт в бою»

Отметьте каждый пункт после деплоя:

- [ ] `https://northmp.su/` — главная, **не Tilda**, код **200**
- [ ] `https://northmp.su/admin.html` — вход в админку
- [ ] `https://northmp.su/product.html?slug=severnyy-kochevnik` — карточка товара
- [ ] `https://northmp.su/checkout.html` — корзина / оформление
- [ ] `https://northmp.su/server/data/shop-orders.json` — **404** (утечки нет)
- [ ] SSL: замок в браузере, сертификат валиден
- [ ] Баннер cookies → «Принять» → Метрика в Network
- [ ] Тестовый заказ + оплата ЮKassa
- [ ] Webhook ЮKassa срабатывает (статус заказа меняется)
- [ ] СДЭК: выбор города и ПВЗ на checkout
- [ ] `pm2 status` — процесс `nmp` **online**
- [ ] Бэкап `server/data/` настроен (см. ниже)

---

## Часть 7. Обновление сайта

При изменениях в GitHub:

```bash
ssh root@185.xxx.xxx.xxx
cd /var/www/nmp
git pull origin main
npm install --omit=dev
pm2 restart nmp
```

Если меняли только CMS через админку — **git pull не нужен**, данные уже в `server/data/cms.json`.

---

## Часть 8. Резервное копирование

Приложение само пишет бэкапы в `server/data/backups/` (интервал `BACKUP_INTERVAL_HOURS` в `.env`).

**Дополнительно** — раз в сутки копировать на другой носитель:

```bash
# пример cron на VPS (crontab -e)
0 3 * * * tar -czf /root/backups/nmp-data-$(date +\%F).tar.gz -C /var/www/nmp server/data images/uploads
```

Папки **`server/data/`** и **`images/uploads/`** — критичны. Без них потеряете заказы и загруженные фото.

---

## Часть 9. Частые проблемы

### «Domain has been assigned» (Tilda)

Домен всё ещё привязан к Tilda или DNS указывает не на VPS.  
→ Отвязать в Tilda + поправить A-запись в Beget / origin в DDoS-Guard.

### 502 Bad Gateway

Node не запущен или nginx не видит порт 3000.

```bash
pm2 status
pm2 restart nmp
curl http://127.0.0.1:3000/
```

### Сайт открывается по IP, но не по домену

DNS ещё не обновился или неверная A-запись в Beget. Проверить `dig northmp.su`.

### После git pull сайт «откатился»

`server/data/` не в Git — не перезаписывается. Если удалили папку вручную — восстановить из бэкапа.

### ЮKassa: оплата прошла, статус не меняется

Проверить webhook URL, доступность `https://northmp.su/api/payments/webhook` извне, логи `pm2 logs nmp`.

### Несколько копий сервера

Не запускайте два `node server/index.js` на одном VPS — заказы и CMS могут рассинхронизироваться. Только один процесс через PM2.

---

## Часть 10. Схема файлов на сервере

```
/var/www/nmp/
├── .env                 ← секреты (не в Git!)
├── server/
│   ├── index.js         ← точка входа
│   └── data/            ← CMS, заказы, бэкапы (БЕЗ ПОТЕРЬ!)
├── images/uploads/      ← фото из админки
├── index.html           ← витрина
└── admin.html           ← админка
```

---

## Краткий порядок действий (TL;DR)

1. **Beget VPS** Ubuntu → SSH  
2. **Node 20 + pm2 + nginx + certbot**  
3. **git clone** → `npm install` → **`.env`**  
4. **pm2 start** → проверка `:3000`  
5. **nginx** → **certbot** → HTTPS  
6. **Beget DNS:** A `@` и `www` → IP VPS  
7. **Tilda:** отвязать домен  
8. **DDoS-Guard:** origin → IP VPS (если используется)  
9. **ЮKassa webhook** + тест оплаты  
10. **Чеклист** из части 6  

---

## Контакты и доступы (заполните для себя)

| Параметр | Значение |
|----------|----------|
| IP VPS Beget | |
| SSH пользователь | root / … |
| Путь проекта | `/var/www/nmp` |
| Beget login | |
| DDoS-Guard (да/нет) | |
| Дата деплоя | |

---

*Документ для репозитория NMP. При изменении инфраструктуры обновляйте IP и ветку деплоя.*
