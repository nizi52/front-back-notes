const express    = require('express');
const http       = require('http');
const socketIo   = require('socket.io');
const webpush    = require('web-push');
const bodyParser = require('body-parser');
const cors       = require('cors');
const path       = require('path');

const VAPID_PUBLIC_KEY  = 'BMjtvbXwYgTw5FUokoAqXZYb_fuT2pp8uhJKhJoGi7pMK-YDMSPDss50D0BxXnUQ98aWf_wui784JsSKx_wysME';
const VAPID_PRIVATE_KEY = 'v2-b621lvveU-Zis6z0g18hc0YN_3vrOdq3DcT8Dj0s';

webpush.setVapidDetails(
  'mailto:yayaza2006@bk.ru', 
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, './')));

let subscriptions = [];

const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

io.on('connection', socket => {
  console.log('Клиент подключён:', socket.id);

  socket.on('newTask', task => {
    console.log('Новая задача:', task.text);

    io.emit('taskAdded', task);

    const payload = JSON.stringify({
      title: 'Новая заметка',
      body: task.text
    });
    subscriptions.forEach(sub => {
      webpush.sendNotification(sub, payload)
        .catch(err => {
          console.error('Push error:', err.statusCode);
          if (err.statusCode === 410) {
            subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
          }
        });
    });
  });

  socket.on('disconnect', () => {
    console.log('Клиент отключён:', socket.id);
  });
});

app.post('/subscribe', (req, res) => {
  const sub = req.body;
  const exists = subscriptions.some(s => s.endpoint === sub.endpoint);
  if (!exists) subscriptions.push(sub);
  console.log('Подписок всего:', subscriptions.length);
  res.status(201).json({ message: 'Подписка сохранена' });
});

app.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  subscriptions = subscriptions.filter(s => s.endpoint !== endpoint);
  console.log('Подписок осталось:', subscriptions.length);
  res.status(200).json({ message: 'Подписка удалена' });
});

app.get('/vapid-public-key', (req, res) => {
  res.json({ key: VAPID_PUBLIC_KEY });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`\n✅ Сервер запущен: http://localhost:${PORT}`);
  console.log(`📢 VAPID публичный ключ: ${VAPID_PUBLIC_KEY.slice(0, 20)}...\n`);
});
