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
const reminders   = new Map(); 

const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

function sendPushToAll(payload) {
  const json = JSON.stringify(payload);
  subscriptions.forEach(sub => {
    webpush.sendNotification(sub, json).catch(err => {
      console.error('Push error:', err.statusCode);
      if (err.statusCode === 410) {
        subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
      }
    });
  });
}

io.on('connection', socket => {
  console.log('Клиент подключён:', socket.id);

  socket.on('newTask', task => {
    console.log('Новая задача:', task.text);
    io.emit('taskAdded', task);
    sendPushToAll({ title: 'Новая заметка', body: task.text });
  });

  socket.on('newReminder', reminder => {
    const { id, text, reminderTime } = reminder;
    const delay = reminderTime - Date.now();
    if (delay <= 0) return;

    console.log(`Напоминание запланировано: "${text}" через ${Math.round(delay/1000)}с`);

    const timeoutId = setTimeout(() => {
      console.log(`Отправляем напоминание: "${text}"`);
      sendPushToAll({ title: '⏰ Напоминание', body: text, reminderId: id });
      reminders.delete(id);
    }, delay);

    reminders.set(id, { timeoutId, text, reminderTime });
  });

  socket.on('disconnect', () => console.log('Клиент отключён:', socket.id));
});

app.post('/subscribe', (req, res) => {
  const sub = req.body;
  if (!subscriptions.some(s => s.endpoint === sub.endpoint)) {
    subscriptions.push(sub);
  }
  console.log('Подписок:', subscriptions.length);
  res.status(201).json({ message: 'Подписка сохранена' });
});

app.post('/unsubscribe', (req, res) => {
  subscriptions = subscriptions.filter(s => s.endpoint !== req.body.endpoint);
  res.status(200).json({ message: 'Подписка удалена' });
});

app.post('/snooze', (req, res) => {
  const reminderId = parseInt(req.query.reminderId, 10);
  if (!reminderId || !reminders.has(reminderId)) {
    return res.status(404).json({ error: 'Reminder not found' });
  }

  const reminder = reminders.get(reminderId);
  clearTimeout(reminder.timeoutId);

  const newDelay    = 5 * 60 * 1000; // 5 минут
  const newTimeoutId = setTimeout(() => {
    sendPushToAll({
      title: '⏰ Напоминание (отложено)',
      body:  reminder.text,
      reminderId
    });
    reminders.delete(reminderId);
  }, newDelay);

  reminders.set(reminderId, {
    timeoutId:    newTimeoutId,
    text:         reminder.text,
    reminderTime: Date.now() + newDelay
  });

  console.log(`Напоминание ${reminderId} отложено на 5 минут`);
  res.status(200).json({ message: 'Reminder snoozed for 5 minutes' });
});

app.get('/vapid-public-key', (req, res) => {
  res.json({ key: VAPID_PUBLIC_KEY });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`\n✅ Сервер запущен: http://localhost:${PORT}`);
  console.log(`📢 VAPID публичный ключ: ${VAPID_PUBLIC_KEY.slice(0, 20)}...\n`);
});