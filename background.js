const OFFSCREEN_URL = 'offscreen.html';
const DOWNLOAD_SUBFOLDER = 'GravIn';
const MAX_SIDE = 3840;

// ---------- estado (sobrevive ao service worker dormir) ----------

async function getState() {
  const { state } = await chrome.storage.session.get('state');
  return state ?? { status: 'idle' };
}

async function setState(state) {
  await chrome.storage.session.set({ state });
  const recording = state.status === 'recording';
  await chrome.action.setBadgeBackgroundColor({ color: '#d93025' });
  await chrome.action.setBadgeText({ text: recording ? 'REC' : '' });
}

// ---------- viewport ----------

// Roda dentro da página: devolve o tamanho real do viewport (o emulado, se o
// modo dispositivo do DevTools estiver ativo).
function readViewport() {
  const vv = window.visualViewport;
  const scale = vv ? vv.scale : 1;
  // Páginas sem <meta viewport> em emulação mobile têm innerWidth = 980;
  // visualViewport * scale devolve a largura do dispositivo de verdade.
  const zoomed = Math.abs(scale - 1) > 0.01;
  return {
    width: zoomed ? vv.width * scale : window.innerWidth,
    height: zoomed ? vv.height * scale : window.innerHeight,
    dpr: window.devicePixelRatio || 1,
  };
}

async function measure(tabId) {
  let viewport;
  try {
    const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func: readViewport });
    viewport = injection.result;
  } catch {
    throw new Error('Não é possível gravar esta página (páginas internas do navegador não são permitidas).');
  }
  const { scale = 'auto' } = await chrome.storage.local.get('scale');
  let factor = scale === 'native' ? viewport.dpr : scale === '1' ? 1 : Math.min(viewport.dpr, 2);
  factor = Math.min(factor, MAX_SIDE / Math.max(viewport.width, viewport.height));
  // H.264 exige dimensões pares.
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  return {
    cssWidth: Math.round(viewport.width),
    cssHeight: Math.round(viewport.height),
    width: even(viewport.width * factor),
    height: even(viewport.height * factor),
  };
}

// ---------- gravação ----------

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['USER_MEDIA'],
    justification: 'Gravar o vídeo da aba capturada.',
  });
}

async function closeOffscreen() {
  if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument();
}

async function start(tabId) {
  const state = await getState();
  if (state.status !== 'idle') throw new Error('Já existe uma gravação em andamento.');

  const size = await measure(tabId);
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  const { format = 'mp4' } = await chrome.storage.local.get('format');

  await ensureOffscreen();
  const response = await chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'start',
    streamId,
    format,
    ...size,
  });
  if (!response?.ok) {
    await closeOffscreen();
    throw new Error(response?.error || 'Falha ao iniciar a captura.');
  }
  await setState({ status: 'recording', tabId, startedAt: Date.now(), ...size });
}

async function stop() {
  const state = await getState();
  if (state.status !== 'recording') return;
  await setState({ ...state, status: 'saving' });
  const response = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop' }).catch(() => null);
  if (!response?.ok) {
    await closeOffscreen();
    await setState({ status: 'idle', last: { error: 'A gravação foi perdida (o gravador não estava mais ativo).' } });
  }
}

async function toggle(tabId) {
  const state = await getState();
  if (state.status === 'recording') return stop();
  if (state.status === 'idle') return start(tabId);
}

// O offscreen terminou: ou já gravou na pasta escolhida, ou manda um blob URL
// para cair no fallback de Downloads.
async function finished(msg) {
  if (msg.error) {
    await closeOffscreen();
    await setState({ status: 'idle', last: { error: msg.error } });
    return;
  }
  if (msg.saved) {
    await closeOffscreen();
    await setState({ status: 'idle', last: { name: msg.name, where: msg.folder } });
    return;
  }
  try {
    const downloadId = await chrome.downloads.download({
      url: msg.url,
      filename: `${DOWNLOAD_SUBFOLDER}/${msg.name}`,
      conflictAction: 'uniquify',
      saveAs: false,
    });
    await chrome.storage.session.set({ pendingDownload: downloadId });
    await setState({
      status: 'idle',
      last: { name: msg.name, where: `Downloads/${DOWNLOAD_SUBFOLDER}`, fallback: msg.fallbackReason },
    });
  } catch (e) {
    await closeOffscreen();
    await setState({ status: 'idle', last: { error: `Falha ao salvar: ${e.message}` } });
  }
}

// O blob URL só vive enquanto o offscreen existir; fecha depois do download.
chrome.downloads.onChanged.addListener(async (delta) => {
  const { pendingDownload } = await chrome.storage.session.get('pendingDownload');
  if (delta.id !== pendingDownload) return;
  const done = delta.state?.current === 'complete' || delta.state?.current === 'interrupted';
  if (!done) return;
  await chrome.storage.session.remove('pendingDownload');
  if ((await getState()).status === 'idle') await closeOffscreen();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'background') return;
  const handlers = {
    start: () => start(msg.tabId),
    stop: () => stop(),
    measure: () => measure(msg.tabId),
    finished: () => finished(msg),
  };
  const handler = handlers[msg.type];
  if (!handler) return;
  handler().then(
    (result) => sendResponse({ ok: true, result }),
    (e) => sendResponse({ ok: false, error: e.message || String(e) }),
  );
  return true;
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'toggle-recording' || !tab?.id) return;
  try {
    await toggle(tab.id);
  } catch (e) {
    await setState({ status: 'idle', last: { error: e.message || String(e) } });
  }
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.runtime.openOptionsPage();
});
