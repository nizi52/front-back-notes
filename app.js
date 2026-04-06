/* ── DOM (App Shell elements) ── */
const contentDiv   = document.getElementById('app-content');
const homeBtn      = document.getElementById('home-btn');
const aboutBtn     = document.getElementById('about-btn');
const offlineBadge = document.getElementById('offline-badge');
const enableBtn    = document.getElementById('enable-push');
const disableBtn   = document.getElementById('disable-push');

/* ── WebSocket ── */
const socket = io('http://localhost:3001');
socket.on('connect',    () => console.log('WS подключён:', socket.id));
socket.on('disconnect', () => console.log('WS отключён'));

/* При получении события от другого клиента */
socket.on('taskAdded', (task) => {
  showToast(`Новая заметка: ${task.text}`);
});

/* ── Toast ── */
function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/* ── Navigation ── */
function setActiveButton(id) {
  [homeBtn, aboutBtn].forEach(b => b.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

async function loadContent(page) {
  contentDiv.innerHTML = `
    <div class="skeleton">
      <div class="skeleton-line wide"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line"></div>
    </div>`;
  try {
    const res  = await fetch(`/content/${page}.html`);
    const html = await res.text();
    contentDiv.innerHTML = html;
    if (page === 'home') initNotes();
  } catch (err) {
    contentDiv.innerHTML = `<p class="empty-state">Ошибка загрузки страницы.</p>`;
  }
}

homeBtn.addEventListener('click',  () => { setActiveButton('home-btn');  loadContent('home');  });
aboutBtn.addEventListener('click', () => { setActiveButton('about-btn'); loadContent('about'); });

/* ── Storage ── */
function getNotes()       { return JSON.parse(localStorage.getItem('notes') || '[]'); }
function saveNotes(notes) { localStorage.setItem('notes', JSON.stringify(notes)); }

/* ── Render notes ── */
function renderNotes() {
  const list  = document.getElementById('notes-list');
  const empty = document.getElementById('empty-state');
  if (!list) return;

  const notes = getNotes();
  list.innerHTML = '';

  if (notes.length === 0) {
    empty && empty.classList.remove('hidden');
    return;
  }
  empty && empty.classList.add('hidden');

  notes.forEach((note, idx) => {
    const li = document.createElement('li');
    li.className = 'note-item';

    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.className = 'note-check';
    cb.checked = note.done || false;
    cb.addEventListener('change', () => {
      const n = getNotes(); n[idx].done = !n[idx].done; saveNotes(n); renderNotes();
    });

    const textWrap = document.createElement('div');
    textWrap.style.flex = '1';

    const span = document.createElement('span');
    span.className = 'note-text' + (note.done ? ' done' : '');
    span.textContent = note.text;
    textWrap.appendChild(span);

    /* Показываем время напоминания если есть */
    if (note.reminder) {
      const rem = document.createElement('div');
      rem.className = 'note-reminder';
      rem.textContent = '⏰ ' + new Date(note.reminder).toLocaleString();
      textWrap.appendChild(rem);
    }

    const del = document.createElement('button');
    del.className = 'btn-delete'; del.title = 'Удалить'; del.textContent = '✕';
    del.addEventListener('click', () => {
      const n = getNotes(); n.splice(idx, 1); saveNotes(n); renderNotes();
    });

    li.append(cb, textWrap, del);
    list.appendChild(li);
  });
}

/* ── Add note ── */
function addNote(text, reminderTimestamp = null) {
  const notes = getNotes();
  const newNote = { id: Date.now(), text, done: false, reminder: reminderTimestamp };
  notes.unshift(newNote);
  saveNotes(notes);
  renderNotes();

  if (reminderTimestamp) {
    /* Отправляем напоминание на сервер */
    socket.emit('newReminder', {
      id: newNote.id,
      text,
      reminderTime: reminderTimestamp
    });
  } else {
    socket.emit('newTask', { text, timestamp: Date.now() });
  }
}

/* ── Init notes (вызывается после загрузки home.html) ── */
function initNotes() {
  renderNotes();

  const form         = document.getElementById('note-form');
  const input        = document.getElementById('note-input');
  const reminderForm = document.getElementById('reminder-form');
  const reminderText = document.getElementById('reminder-text');
  const reminderTime = document.getElementById('reminder-time');
  const clearBtn     = document.getElementById('clear-btn');

  /* Обычная заметка */
  function tryAdd() {
    const text = input.value.trim();
    if (text) { addNote(text); input.value = ''; input.focus(); }
  }
  form.addEventListener('submit', e => { e.preventDefault(); tryAdd(); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); tryAdd(); } });

  /* Заметка с напоминанием */
  reminderForm.addEventListener('submit', e => {
    e.preventDefault();
    const text     = reminderText.value.trim();
    const datetime = reminderTime.value;
    if (!text || !datetime) return;
    const timestamp = new Date(datetime).getTime();
    if (timestamp <= Date.now()) {
      alert('Дата напоминания должна быть в будущем');
      return;
    }
    addNote(text, timestamp);
    reminderText.value = '';
    reminderTime.value = '';
  });

  clearBtn.addEventListener('click', () => {
    if (confirm('Удалить все заметки?')) { saveNotes([]); renderNotes(); }
  });
}

/* ── Offline indicator ── */
function updateOnline() { offlineBadge.classList.toggle('hidden', navigator.onLine); }
window.addEventListener('online',  updateOnline);
window.addEventListener('offline', updateOnline);
updateOnline();

/* ── VAPID helper ── */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output  = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
  return output;
}

/* ── Push subscribe / unsubscribe ── */
async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(window.VAPID_PUBLIC_KEY || '')
    });
    await fetch('http://localhost:3001/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub)
    });
    console.log('Push подписка отправлена');
  } catch (err) {
    console.error('Ошибка подписки на push:', err);
  }
}

async function unsubscribeFromPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await fetch('http://localhost:3001/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint })
    });
    await sub.unsubscribe();
  }
}

/* ── Service Worker + Push buttons ── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      console.log('SW зарегистрирован, scope:', reg.scope);

      if (enableBtn && disableBtn) {
        const existing = await reg.pushManager.getSubscription();
        if (existing) { enableBtn.classList.add('hidden'); disableBtn.classList.remove('hidden'); }

        enableBtn.addEventListener('click', async () => {
          if (Notification.permission === 'denied') {
            alert('Уведомления запрещены. Разрешите в настройках браузера.'); return;
          }
          if (Notification.permission === 'default') {
            const p = await Notification.requestPermission();
            if (p !== 'granted') { alert('Необходимо разрешить уведомления.'); return; }
          }
          await subscribeToPush();
          enableBtn.classList.add('hidden'); disableBtn.classList.remove('hidden');
        });

        disableBtn.addEventListener('click', async () => {
          await unsubscribeFromPush();
          disableBtn.classList.add('hidden'); enableBtn.classList.remove('hidden');
        });
      }
    } catch (err) {
      console.error('Ошибка регистрации SW:', err);
    }
  });
}

/* ── Init ── */
loadContent('home');