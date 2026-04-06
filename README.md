# Notes PWA — занятия 13–17

Прогрессивное веб-приложение для управления заметками с поддержкой офлайн-режима,
App Shell архитектуры, WebSocket и Push-уведомлений с напоминаниями.

---

## Содержание

1. [Структура проекта](#структура-проекта)
2. [Быстрый старт](#быстрый-старт)
3. [Настройка HTTPS](#настройка-https)
4. [Описание файлов](#описание-файлов)
5. [Что реализовано по занятиям](#что-реализовано-по-занятиям)
6. [Проверка в DevTools](#проверка-в-devtools)
7. [Частые проблемы](#частые-проблемы)

---

## Структура проекта

```
notes-app/
├── content/
│   ├── home.html        # динамический контент главной страницы
│   └── about.html       # страница «О приложении»
├── icons/               # иконки PNG всех размеров (72–512px) + favicon.ico
├── index.html           # App Shell — каркас приложения
├── style.css            # стили
├── app.js               # клиентская логика (навигация, заметки, WS, Push)
├── sw.js                # Service Worker (кэш, Push, Snooze)
├── manifest.json        # Web App Manifest (PWA)
├── server.js            # Node.js сервер (Socket.IO, Push, напоминания)
├── package.json         # зависимости
└── README.md
```

---

## Быстрый старт

### Шаг 1 — Установить зависимости

```bash
npm install
```

Устанавливает: `express`, `socket.io`, `web-push`, `body-parser`, `cors`.

### Шаг 2 — Сгенерировать VAPID-ключи

VAPID-ключи нужны для идентификации сервера при отправке Push-уведомлений.

```bash
npx web-push generate-vapid-keys
```

Вы увидите вывод вида:
```
Public Key:
BG7xYz...длинная строка...

Private Key:
abc123...длинная строка...
```

Откройте `server.js` и замените строки:
```js
const VAPID_PUBLIC_KEY  = 'ВСТАВЬТЕ_ВАШ_ПУБЛИЧНЫЙ_КЛЮЧ';
const VAPID_PRIVATE_KEY = 'ВСТАВЬТЕ_ВАШ_ПРИВАТНЫЙ_КЛЮЧ';
```
а также укажите свой email:
```js
webpush.setVapidDetails(
  'mailto:ваш@email.com',   // ← сюда
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);
```

### Шаг 3 — Запустить сервер

```bash
npm start
```

Откройте в браузере: **http://localhost:3001**

---

## Настройка HTTPS

Service Worker и Push-уведомления требуют HTTPS (исключение — `localhost`).
Для деплоя или тестирования на реальном домене используйте `mkcert`.

### Установка mkcert

**Windows** (нужен Chocolatey, PowerShell от администратора):
```bash
choco install mkcert
```

**macOS:**
```bash
brew install mkcert
```

**Linux:**
```bash
sudo apt install libnss3-tools
curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
chmod +x mkcert-v*-linux-amd64
sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert
```

### Создание сертификата

Выполните в папке проекта:
```bash
mkcert -install
mkcert localhost 127.0.0.1 ::1
```

В папке появятся два файла:
- `localhost.pem` — сертификат
- `localhost-key.pem` — приватный ключ

### Запуск с HTTPS

```bash
npm install -g http-server
http-server --ssl --cert localhost.pem --key localhost-key.pem -p 3000
```

Откройте: **https://localhost:3000**

> Сервер Node.js при этом продолжает работать на `http://localhost:3001`
> (WebSocket и Push работают через него).

---

## Описание файлов

### `index.html` — App Shell
Минимальный каркас приложения: шапка, навигация, контейнер для контента, футер
с кнопками Push. Кэшируется при первом посещении и загружается мгновенно даже
в офлайне. Динамический контент подгружается в `<main id="app-content">`.

### `app.js` — клиентская логика
- **Навигация**: при клике на вкладку загружает соответствующий HTML-фрагмент
  через `fetch('/content/home.html')` и вставляет в контейнер.
- **Заметки**: сохранение в `localStorage`, рендеринг списка, удаление, отметка
  выполненных.
- **Напоминания**: вторая форма с `datetime-local`, при отправке передаёт
  timestamp на сервер через WebSocket.
- **WebSocket**: подключение к серверу через Socket.IO, отправка событий
  `newTask` и `newReminder`, показ тост-уведомлений при получении `taskAdded`.
- **Push**: функции `subscribeToPush` / `unsubscribeFromPush` через `PushManager`,
  кнопки «Включить/Отключить уведомления».

### `sw.js` — Service Worker
- **install**: кэширует все статические файлы App Shell.
- **activate**: удаляет устаревшие кэши.
- **fetch**: два режима:
  - `/content/*` — Network First (сначала сеть, при ошибке — кэш)
  - всё остальное — Cache First (сначала кэш, при промахе — сеть)
- **push**: показывает системное уведомление, для напоминаний добавляет кнопку
  «Отложить на 5 минут».
- **notificationclick**: обрабатывает нажатие кнопки «Отложить» — отправляет
  POST `/snooze` на сервер.

### `server.js` — Node.js сервер
- Раздаёт статические файлы через `express.static`.
- **Socket.IO**: обрабатывает события `newTask` (рассылка всем клиентам +
  мгновенный Push) и `newReminder` (планирует Push через `setTimeout`).
- **`/subscribe`**: сохраняет Push-подписку клиента.
- **`/unsubscribe`**: удаляет Push-подписку.
- **`/snooze`**: отменяет текущий таймер напоминания и переносит его на 5 минут.
- **`/vapid-public-key`**: возвращает публичный VAPID-ключ для клиента.

### `manifest.json` — Web App Manifest
Описывает приложение для браузера: название, иконки, цвета, режим отображения
`standalone` (без интерфейса браузера). Позволяет установить приложение на
рабочий стол.

---

## Что реализовано по занятиям

| Занятие | Тема | Что добавлено |
|---------|------|---------------|
| 13 | Service Worker | Регистрация SW, кэширование статики, офлайн-режим (Cache First) |
| 14 | Web App Manifest | `manifest.json`, иконки PNG 8 размеров, мета-теги для iOS/Android, установка как PWA |
| 15 | HTTPS + App Shell | Локальный HTTPS через `mkcert`, архитектура App Shell, динамическая загрузка страниц через `fetch`, skeleton-loader |
| 16 | WebSocket + Push | Socket.IO сервер, тост-уведомления между вкладками, подписка на Push через `PushManager`, системные уведомления |
| 17 | Детализация Push | Форма с `datetime-local`, планирование уведомлений через `setTimeout`, кнопка «Отложить на 5 минут», эндпоинт `/snooze` |

---

## Проверка в DevTools

Откройте **F12 → вкладка Application**:

**Service Workers**
- Статус должен быть `activated and is running` с зелёной точкой
- Если показывает `waiting` — нажмите `skipWaiting`

**Cache Storage**
- `notes-cache-v4` — статические файлы App Shell (index.html, app.js, иконки и т.д.)
- `dynamic-content-v1` — динамические страницы (home.html, about.html)

**Manifest**
- Все поля заполнены, иконки загружены без ошибок
- В разделе `Installability` не должно быть критических ошибок

**Local Storage → http://localhost:3001**
- Ключ `notes` — массив заметок в JSON

### Проверка офлайн-режима
1. DevTools → Network → выберите **Offline**
2. Обновите страницу — приложение загружается из кэша
3. Заметки отображаются, новые можно добавлять (сохраняются в localStorage)

### Проверка WebSocket
1. Откройте две вкладки `http://localhost:3001`
2. Добавьте заметку в первой вкладке
3. Во второй появится тост «Новая заметка: ...»

### Проверка Push-уведомлений
1. Нажмите **«Включить уведомления»** и разрешите в браузере
2. Добавьте заметку с напоминанием на 1–2 минуты вперёд
3. Сверните браузер или переключитесь на другую вкладку
4. Через указанное время придёт системное уведомление с кнопкой **«Отложить на 5 минут»**

---

## Частые проблемы

**`Error: Vapid subject is not a valid URL`**
→ Email должен начинаться с `mailto:`:
```js
'mailto:ваш@email.com'  // правильно
'ваш@email.com'         // неправильно
```

**`Could not find certificate localhost.pem`**
→ Сначала создайте сертификат: `mkcert -install` затем `mkcert localhost 127.0.0.1 ::1`

**`Failed to fetch` в консоли SW**
→ Выполните в DevTools → Application → Service Workers → **Unregister**,
затем перезагрузите страницу

**Push не приходят**
→ Проверьте в консоли браузера:
```js
Notification.permission  // должно быть "granted"
```
→ Убедитесь что VAPID ключи вставлены в `server.js`

**SW не обновляется после изменений**
→ DevTools → Application → Service Workers → поставьте галочку
**«Update on reload»** и перезагрузите страницу