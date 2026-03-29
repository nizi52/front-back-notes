const form = document.getElementById('note-form');
const input = document.getElementById('note-input');
const list = document.getElementById('notes-list');
const clearBtn = document.getElementById('clear-btn');
const emptyState = document.getElementById('empty-state')
const offlineBadge = document.getElementById('offline-badge');

function getNotes() {
    return JSON.parse(localStorage.getItem('notes') || '[]');
}
function saveNotes(notes) {
    localStorage.setItem('notes', JSON.stringify(notes));
}

function render() {
    const notes = getNotes();
    list.innerHTML = '';

    if (notes.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }
    emptyState.classList.add('hidden');

    notes.forEach((note, idx) => {
        const li = document.createElement('li');
        li.className = 'note-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'note-check';
        checkbox.checked = note.done || false;
        checkbox.addEventListener('change', () => toggleDone(idx));

        const span = document.createElement('span');
        span.className = 'note-text' + (note.done ? ' done ' : '');
        span.textContent = note.text;

        const del = document.createElement('button');
        del.className = 'btn-delete';
        del.title = 'Удалить';
        del.textContent = '✕'
        del.addEventListener('click', () => deleteNote(idx));

        li.append(checkbox, span, del);
        list.appendChild(li);
    });
}

function addNote(text) {
    const notes = getNotes();
    notes.unshift({ text, done: false});
    saveNotes(notes);
    render();
}

function deleteNote(idx) {
    const notes = getNotes();
    notes.splice(idx, 1);
    saveNotes(notes);
    render();
}

function clearAll() {
    if (confirm('Удалить все заметки?')) {
        saveNotes([]);
        render();
    }
}

form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (text) { addNote(text); input.value = ''; }
});

clearBtn.addEventListener('click', clearAll);

function updateOnlineStatus() {
    if (!navigator.onLine) {
        offlineBadge.classList.remove('hidden');
    } else {
        offlineBadge.classList.add('hidden');
    }
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const reg = await navigator.serviceWorker.register('/sw.js');
            console.log('✅ Service Worker зарегистрирован, scope:', reg.scope);
        } catch (err) {
            console.error('❌ Ошибка регистрации Service Worker:', err);
        }
    });
}

render();
