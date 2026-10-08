// Guarda o FileSystemDirectoryHandle da pasta escolhida (chrome.storage não
// consegue serializar handles; IndexedDB consegue).
const DB_NAME = 'gravin';
const STORE = 'kv';
const DIR_KEY = 'dir';

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const request = fn(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export const getDir = () => run('readonly', (store) => store.get(DIR_KEY));
export const setDir = (handle) => run('readwrite', (store) => store.put(handle, DIR_KEY));
export const clearDir = () => run('readwrite', (store) => store.delete(DIR_KEY));

export async function dirPermission(handle) {
  if (!handle) return 'none';
  try {
    return await handle.queryPermission({ mode: 'readwrite' });
  } catch {
    return 'denied';
  }
}
