const CACHE_NAME         = 'notes-cache-v4';
const DYNAMIC_CACHE_NAME = 'dynamic-content-v2';

const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icons/favicon.ico',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== DYNAMIC_CACHE_NAME)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  /* Пропускаем не-GET */
  if (event.request.method !== 'GET') return;

  /* Пропускаем внешние запросы */
  if (url.origin !== location.origin) return;

  /* Пропускаем chrome-extension и прочее */
  if (!url.protocol.startsWith('http')) return;

  /* Динамический контент — Network First */
  if (url.pathname.startsWith('/content/')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          /* Клонируем ДО того как читаем тело */
          const clone = res.clone();
          caches.open(DYNAMIC_CACHE_NAME)
            .then(c => c.put(event.request, clone));
          return res;
        })
        .catch(() =>
          caches.match(event.request)
            .then(cached => cached || caches.match('/content/home.html'))
        )
    );
    return;
  }

  /* Cache First для всего остального */
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(res => {
        /* Кэшируем только успешные ответы */
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      }).catch(() => {
        /* Офлайн и нет в кэше */
        if (event.request.headers.get('accept').includes('text/html')) {
          return caches.match('/index.html');
        }
      });
    })
  );
});

/* ── Push ── */
self.addEventListener('push', event => {
  let data = { title: 'Новое уведомление', body: '', reminderId: null };
  if (event.data) {
    try { data = event.data.json(); } catch { data.body = event.data.text(); }
  }

  const options = {
    body:  data.body,
    icon:  '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    data:  { reminderId: data.reminderId }
  };

  if (data.reminderId) {
    options.actions = [{ action: 'snooze', title: 'Отложить на 5 минут' }];
  }

  event.waitUntil(self.registration.showNotification(data.title, options));
});

/* ── Notification click ── */
self.addEventListener('notificationclick', event => {
  const { action, notification } = event;
  notification.close();

  if (action === 'snooze') {
    const reminderId = notification.data.reminderId;
    event.waitUntil(
      fetch(`/snooze?reminderId=${reminderId}`, { method: 'POST' })
        .catch(err => console.error('Snooze failed:', err))
    );
  } else {
    event.waitUntil(clients.openWindow('http://localhost:3001'));
  }
});