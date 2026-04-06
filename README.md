# Notes PWA — занятия 13–16

Прогрессивное веб-приложение для заметок с поддержкой офлайн-режима, App Shell, WebSocket и Push-уведомлений.

## Быстрый старт

### 1. Установить зависимости
```bash
npm install
```

### 2. Сгенерировать VAPID-ключи
```bash
npx web-push generate-vapid-keys
```
Скопируйте оба ключа и вставьте их в `server.js` (строки `VAPID_PUBLIC_KEY` и `VAPID_PRIVATE_KEY`).

### 3. Запустить сервер
```bash
npm start
```
Открыть в браузере: http://localhost:3001

---

## Настройка HTTPS (занятие 15)

### Установить mkcert
```bash
# Windows (через Chocolatey)
choco install mkcert

# macOS
brew install mkcert
```

### Создать сертификат
```bash
mkcert -install
mkcert localhost 127.0.0.1 ::1
```

### Запустить с HTTPS
```bash
npm install -g http-server
http-server --ssl --cert localhost.pem --key localhost-key.pem -p 3000
```
Открыть: https://localhost:3000

---

## Структура проекта
```
notes-app/
├── content/
│   ├── home.html       # динамический контент главной
│   └── about.html      # страница «О приложении»
├── icons/              # иконки PNG всех размеров
├── index.html          # App Shell (каркас)
├── style.css           # стили
├── app.js              # клиентская логика
├── sw.js               # Service Worker
├── manifest.json       # Web App Manifest
├── server.js           # Node.js сервер (Socket.IO + Push)
└── package.json
```

## Что реализовано

| Занятие | Функциональность |
|---------|-----------------|
| 13 | Service Worker, кэширование, офлайн-режим |
| 14 | Web App Manifest, иконки, PWA-установка |
| 15 | App Shell архитектура, динамическая загрузка контента |
| 16 | WebSocket (Socket.IO), Push-уведомления |
| 17 | Отложенные уведомления 