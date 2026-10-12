# Лендинг Standart Education (Vercel)

Файлы: `index.html` (страница), `api/lead.js` (приём заявок), `vercel.json`.

## Настройки на странице
В начале `index.html`, блок `window.SITE`: бренд, номер WhatsApp, телефон, ссылка на Instagram (пусто = блок отзывов скрыт), ID пикселя Meta.
Номер WhatsApp меняется одной строкой, если текущий забанят.

## Выкладка на Vercel
1. Зарегистрироваться на vercel.com (через GitHub или почту).
2. Add New → Project → загрузить папку `landing` (или через GitHub-репозиторий).
3. Settings → Environment Variables, добавить нужные (см. ниже), затем Redeploy.
4. Settings → Domains: подключить свой домен, если есть.

## Куда падают заявки (переменные окружения)
| Переменная | Что это |
|---|---|
| `TELEGRAM_BOT_TOKEN` | токен бота от @BotFather |
| `TELEGRAM_CHAT_ID` | id чата/группы менеджеров (можно несколько через запятую) |
| `AMO_SUBDOMAIN` | `standarteducation` |
| `AMO_TOKEN` | долгосрочный токен: amoCRM → amoМаркет → Создать интеграцию (внешняя) → Ключи и доступы |
| `AMO_PIPELINE_ID`, `AMO_STATUS_ID` | необязательно: в какую воронку/этап класть сделку |
| `LEAD_WEBHOOK_URL` | адрес Google Apps Script (/exec): шлёт заявку в Telegram и amoCRM, ключи хранятся в скрипте |
| `META_PIXEL_ID`, `META_CAPI_TOKEN` | необязательно: серверное событие Lead для оптимизации рекламы |

Без переменных форма работает, но заявки никуда не уходят (только лог Vercel).

## Ссылка для рекламы
Добавляйте UTM: `https://ваш-домен/?utm_source=fb&utm_campaign=название`. Метки попадут в amoCRM и Telegram.
