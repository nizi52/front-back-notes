const contentDiv  = document.getElementById('app-content');
const homeBtn     = document.getElementById('home-btn');
const aboutBtn    = document.getElementById('about-btn');
const offlineBadge = document.getElementById('offline-badge');
const enableBtn   = document.getElementById('enable-push');
const disableBtn  = document.getElementById('disable-push');

const socket = io('http://localhost:3001');

socket.on('connect', () => console.log('WS подключён:', socket.id));
socket.on('disconnect', () => console.log('WS отключён'));

socket.on('taskAdded', (task) => {
  console.log('Задача от другого клиента:', task);
  showToast(`Новая заметка: ${task.text}`);
});

function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

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
    contentDiv.innerHTML = `<p class="empty-state">Ошибка загрузки страницы. Проверьте соединение.</p>`;
    console.error(err);
  }
}

homeBtn.addEventListener('click',  () => { setActiveButton('home-btn');  loadContent('home');  });
aboutBtn.addEventListener('click', () => { setActiveButton('about-btn'); loadContent('about'); });

function getNotes() { return JSON.parse(localStorage.getItem('notes') || '[]'); }
function saveNotes(notes) { localStorage.setItem('notes', JSON.stringify(notes)); }

function renderNotes() {
  const list      = document.getElementById('notes-list');
  const empty     = document.getElementById('empty-state');
  if (!list) return;
  const notes = getNotes();
  list.innerHTML = '';
  if (notes.length === 0) { empty && empty.classList.remove('hidden'); return; }
  empty && empty.classList.add('hidden');

  notes.forEach((note, idx) => {
    const li = document.createElement('li');
    li.className = 'note-item';

    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.className = 'note-check';
    cb.checked = note.done || false;
    cb.addEventListener('change', () => { const n = getNotes(); n[idx].done = !n[idx].done; saveNotes(n); renderNotes(); });

    const span = document.createElement('span');
    span.className = 'note-text' + (note.done ? ' done' : '');
    span.textContent = note.text;

    const del = document.createElement('button');
    del.className = 'btn-delete'; del.title = 'Удалить'; del.textContent = '✕';
    del.addEventListener('click', () => { const n = getNotes(); n.splice(idx, 1); saveNotes(n); renderNotes(); });

    li.append(cb, span, del);
    list.appendChild(li);
  });
}

function addNote(text) {
  const notes = getNotes();
  notes.unshift({ text, done: false });
  saveNotes(notes);
  renderNotes();
  socket.emit('newTask', { text, timestamp: Date.now() });
}

function initNotes() {
  renderNotes();
  const form  = document.getElementById('note-form');
  const input = document.getElementById('note-input');
  const clearBtn = document.getElementById('clear-btn');

  function tryAdd() {
    const text = input.value.trim();
    if (text) { addNote(text); input.value = ''; input.focus(); }
  }

  form.addEventListener('submit', e => { e.preventDefault(); tryAdd(); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); tryAdd(); } });
  clearBtn.addEventListener('click', () => { if (confirm('Удалить все заметки?')) { saveNotes([]); renderNotes(); } });
}

function updateOnline() { offlineBadge.classList.toggle('hidden', navigator.onLine); }
window.addEventListener('online',  updateOnline);
window.addEventListener('offline', updateOnline);
updateOnline();

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output  = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
  return output;
}

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
    console.log('Push отписка выполнена');
  }
}

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
            alert('Уведомления запрещены. Разрешите их в настройках браузера.'); return;
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

loadContent('home');
