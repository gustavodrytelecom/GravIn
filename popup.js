import { getDir, dirPermission } from './idb.js';

const $ = (id) => document.getElementById(id);
const send = (type, extra = {}) => chrome.runtime.sendMessage({ target: 'background', type, ...extra });

let tabId = null;
let timer = null;

async function getState() {
  const { state } = await chrome.storage.session.get('state');
  return state ?? { status: 'idle' };
}

function elapsed(startedAt) {
  const s = Math.floor((Date.now() - startedAt) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function showSize(size) {
  $('viewport').textContent = `${size.cssWidth} × ${size.cssHeight}`;
  $('video').textContent = `${size.width} × ${size.height} px`;
}

async function renderFolder() {
  const dir = await getDir().catch(() => null);
  const permission = await dirPermission(dir);
  $('folder').textContent = dir ? dir.name : 'Downloads/GravIn';
  const blocked = dir && permission !== 'granted';
  $('warning').hidden = !blocked;
  if (blocked) {
    $('warning').textContent = `Sem permissão para "${dir.name}". Reautorize nas opções (⚙) ou o vídeo vai para Downloads/GravIn.`;
  }
}

async function render() {
  const state = await getState();
  const button = $('toggle');
  const message = $('message');
  clearInterval(timer);
  message.className = 'message';
  message.textContent = '';
  button.classList.toggle('recording', state.status === 'recording');

  if (state.status === 'recording') {
    showSize(state);
    button.disabled = false;
    const tick = () => (button.textContent = `■ Parar (${elapsed(state.startedAt)})`);
    tick();
    timer = setInterval(tick, 500);
    return;
  }

  if (state.status === 'saving') {
    button.disabled = true;
    button.textContent = 'Salvando…';
    return;
  }

  button.textContent = '● Iniciar gravação';
  const measured = await send('measure', { tabId });
  button.disabled = !measured?.ok;
  if (measured?.ok) {
    showSize(measured.result);
  } else {
    $('viewport').textContent = $('video').textContent = '—';
    message.classList.add('error');
    message.textContent = measured?.error || 'Não foi possível ler a aba.';
    return;
  }

  if (state.last?.error) {
    message.classList.add('error');
    message.textContent = state.last.error;
  } else if (state.last?.name) {
    message.textContent = `Salvo: ${state.last.where}/${state.last.name}`;
    if (state.last.fallback) message.textContent += ` — ${state.last.fallback}`;
  }
}

$('toggle').addEventListener('click', async () => {
  const state = await getState();
  $('toggle').disabled = true;
  const response = await send(state.status === 'recording' ? 'stop' : 'start', { tabId });
  await render();
  if (response && !response.ok) {
    $('message').classList.add('error');
    $('message').textContent = response.error;
  }
});

$('openOptions').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

chrome.storage.session.onChanged.addListener((changes) => changes.state && render());

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
tabId = tab?.id ?? null;
await renderFolder();
await render();
