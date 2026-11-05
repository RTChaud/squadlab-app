// IndexedDB storage. Everything stays in this browser — nothing is uploaded.
//
// Stores
//   snapshots : one record per imported extract (the full original JSON is kept
//               untouched in `data`, so future features can use every field).
//   settings  : small key/value records (squad widget mapping, last shortlist…).

const DB_NAME = 'squadlab';
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('This browser does not support local storage (IndexedDB).'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('snapshots')) {
        const store = db.createObjectStore('snapshots', { keyPath: 'id' });
        store.createIndex('careerId', 'careerId', { unique: false });
        store.createIndex('importedAt', 'importedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Could not open local database.'));
    req.onblocked = () => reject(new Error('Local database is blocked by another open tab.'));
  });
  return dbPromise;
}

function run(storeName, mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        let result;
        const req = fn(store);
        if (req) req.onsuccess = () => { result = req.result; };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted.'));
      })
  );
}

// ---- Snapshots -------------------------------------------------------------

export function putSnapshot(record) {
  return run('snapshots', 'readwrite', (s) => s.put(record));
}

export function getSnapshot(id) {
  return run('snapshots', 'readonly', (s) => s.get(id));
}

/** Lightweight list of all snapshots (without the heavy `data` payload). */
export async function listSnapshotMeta() {
  const all = await run('snapshots', 'readonly', (s) => s.getAll());
  return (all || []).map(({ data, ...meta }) => meta);
}

// ---- Settings --------------------------------------------------------------

export async function getSetting(key, fallback = null) {
  const rec = await run('settings', 'readonly', (s) => s.get(key));
  return rec ? rec.value : fallback;
}

export function setSetting(key, value) {
  return run('settings', 'readwrite', (s) => s.put({ key, value }));
}
