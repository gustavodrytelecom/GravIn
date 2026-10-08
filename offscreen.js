import { getDir, dirPermission } from './idb.js';

const MIME_CANDIDATES = {
  mp4: ['video/mp4;codecs=avc1.640033', 'video/mp4;codecs=avc1', 'video/mp4'],
  webm: ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'],
};

let recorder = null;
let stream = null;

function pickMime(format) {
  const order = format === 'webm' ? ['webm', 'mp4'] : ['mp4', 'webm'];
  for (const kind of order) {
    const mime = MIME_CANDIDATES[kind].find((m) => MediaRecorder.isTypeSupported(m));
    if (mime) return { mime, ext: kind };
  }
  throw new Error('Nenhum formato de vídeo suportado neste navegador.');
}

function fileName(width, height, ext) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  return `gravin_${stamp}_${width}x${height}.${ext}`;
}

async function start({ streamId, width, height, cssWidth, cssHeight, format }) {
  if (recorder) throw new Error('Já existe uma gravação em andamento.');

  // min = max força a captura exatamente no tamanho do viewport: o vídeo já
  // sai recortado, sem barras.
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
        minWidth: width,
        maxWidth: width,
        minHeight: height,
        maxHeight: height,
        maxFrameRate: 60,
      },
    },
  });

  const { mime, ext } = pickMime(format);
  const chunks = [];
  recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: mime.split(';')[0] });
    cleanup();
    save(blob, fileName(cssWidth, cssHeight, ext));
  };
  recorder.onerror = (e) => {
    cleanup();
    notify({ error: `Erro na gravação: ${e.error?.message || 'desconhecido'}` });
  };
  // Aba fechada ou navegada para fora: encerra e salva o que tiver.
  stream.getVideoTracks()[0].addEventListener('ended', stop);
  recorder.start(1000);
}

function stop() {
  if (!recorder || recorder.state === 'inactive') return false;
  recorder.stop();
  return true;
}

function cleanup() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  recorder = null;
}

async function save(blob, name) {
  if (!blob.size) return notify({ error: 'A gravação ficou vazia.' });

  let fallbackReason;
  try {
    const dir = await getDir();
    if (dir) {
      if ((await dirPermission(dir)) === 'granted') {
        const file = await dir.getFileHandle(name, { create: true });
        const writable = await file.createWritable();
        await writable.write(blob);
        await writable.close();
        return notify({ saved: true, name, folder: dir.name });
      }
      fallbackReason = `Sem permissão para gravar em "${dir.name}" — reautorize a pasta nas opções.`;
    }
  } catch (e) {
    fallbackReason = `Não foi possível gravar na pasta escolhida (${e.message}).`;
  }
  // Sem pasta (ou sem permissão): o background baixa em Downloads/GravIn.
  notify({ saved: false, name, url: URL.createObjectURL(blob), fallbackReason });
}

function notify(payload) {
  chrome.runtime.sendMessage({ target: 'background', type: 'finished', ...payload });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return;
  if (msg.type === 'start') {
    start(msg).then(
      () => sendResponse({ ok: true }),
      (e) => {
        cleanup();
        sendResponse({ ok: false, error: e.message || String(e) });
      },
    );
    return true;
  }
  if (msg.type === 'stop') sendResponse({ ok: stop() });
});
