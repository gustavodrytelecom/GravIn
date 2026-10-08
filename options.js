import { getDir, setDir, clearDir, dirPermission } from './idb.js';

const $ = (id) => document.getElementById(id);

function status(text, isError = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', isError);
}

async function renderFolder() {
  const dir = await getDir().catch(() => null);
  const permission = await dirPermission(dir);
  $('folder').textContent = dir ? dir.name : 'Downloads/GravIn (padrão)';
  $('permission').textContent = !dir ? '' : permission === 'granted' ? 'autorizada' : 'sem permissão';
  $('permission').classList.toggle('bad', !!dir && permission !== 'granted');
  $('reauthorize').hidden = !dir || permission === 'granted';
  $('reset').hidden = !dir;
}

$('choose').addEventListener('click', async () => {
  try {
    const dir = await window.showDirectoryPicker({ id: 'gravin', mode: 'readwrite', startIn: 'videos' });
    await setDir(dir);
    status(`Pasta definida: ${dir.name}`);
  } catch (e) {
    if (e.name !== 'AbortError') status(`Não foi possível usar essa pasta: ${e.message}`, true);
  }
  renderFolder();
});

$('reauthorize').addEventListener('click', async () => {
  const dir = await getDir();
  const result = await dir.requestPermission({ mode: 'readwrite' });
  status(result === 'granted' ? 'Pasta reautorizada.' : 'Permissão negada.', result !== 'granted');
  renderFolder();
});

$('reset').addEventListener('click', async () => {
  await clearDir();
  status('Os vídeos serão salvos em Downloads/GravIn.');
  renderFolder();
});

for (const key of ['format', 'scale']) {
  $(key).addEventListener('change', () => chrome.storage.local.set({ [key]: $(key).value }));
}

const saved = await chrome.storage.local.get({ format: 'mp4', scale: 'auto' });
$('format').value = saved.format;
$('scale').value = saved.scale;
renderFolder();
