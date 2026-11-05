// IndexedDB storage. Everything stays in this browser — nothing is uploaded.
//
// Stores
//   snapshots     : one record per career + in-game date. The full original
//                   extract is kept untouched in `data`.
//   snapshotIndex : the same records without `data`, so listing history stays
//                   fast even after many seasons of monthly snapshots.
//   settings      : small key/value records ('career', last shortlist, …).
//
// Version history
//   1  first release (snapshot id = career|date|exported_at)
//   2  snapshot id = career|date, snapshotIndex store, 'career' setting.
//      Existing v1 data is migrated in place — nothing is cleared.

const DB_NAME = 'squadlab';
const DB_VERSION = 2;
export const ALL_STORES = ['snapshots', 'snapshotIndex', 'settings'];

let dbPromise = null;

export const snapshotId = (careerId, gameDate) => `${careerId}|${gameDate}`;
export const metaOf = ({ data, ...meta }) => meta;

function migrateFromV1(tx) {
  const snaps = tx.objectStore('snapshots');
  const index = tx.objectStore('snapshotIndex');
  const settings = tx.objectStore('settings');

  snaps.getAll().onsuccess = (ev) => {
    const all = ev.target.result || [];
    // Keep one snapshot per career + date (the most recently imported).
    const keep = new Map();
    for (const r of all) {
      const id = snapshotId(r.careerId, r.gameDate);
      const cur = keep.get(id);
      if (!cur || String(r.importedAt) > String(cur.importedAt)) keep.set(id, r);
    }
    snaps.clear().onsuccess = () => {
      for (const [id, r] of keep) {
        const rec = { ...r, id };
        snaps.put(rec);
        index.put(metaOf(rec));
      }
    };
    if (all.length) {
      // Active career = the one imported most recently (what v1 displayed).
      const latest = [...all].sort((a, b) => String(b.importedAt).localeCompare(String(a.importedAt)))[0];
      const created = all
        .filter((r) => r.careerId === latest.careerId)
        .map((r) => r.importedAt)
        .sort()[0];
      settings.put({ key: 'career', value: { careerId: latest.careerId, createdAt: created } });
    }
  };

  // Manual squad mapping from v1 is no longer used.
  settings.openCursor().onsuccess = (ev) => {
    const cur = ev.target.result;
    if (!cur) return;
    if (String(cur.key).startsWith('squadMap:')) cur.delete();
    cur.continue();
  };
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('This browser does not support local storage (IndexedDB).'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('snapshotIndex')) db.createObjectStore('snapshotIndex', { keyPath: 'id' });
      if (e.oldVersion === 1) migrateFromV1(req.transaction);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('Could not open local database.'));
    req.onblocked = () => reject(new Error('SquadLab is open in another tab. Close it and reload.'));
  });
  // Ask the browser not to evict our data under storage pressure.
  try { navigator.storage?.persist?.(); } catch { /* optional */ }
  return dbPromise;
}

/**
 * Run `fn(stores)` inside one transaction. Resolves with fn's collected result
 * only after the transaction commits; any error aborts every change in it.
 */
function tx(storeNames, mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(storeNames, mode);
        const stores = Object.fromEntries(storeNames.map((n) => [n, t.objectStore(n)]));
        const out = {};
        try {
          fn(stores, out);
        } catch (err) {
          try { t.abort(); } catch { /* already finished */ }
          reject(err);
          return;
        }
        t.oncomplete = () => resolve(out.value);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error('Storage transaction aborted.'));
      })
  );
}

const collect = (out, req) => { req.onsuccess = () => { out.value = req.result; }; };

// ---- Snapshots -------------------------------------------------------------

export const getSnapshot = (id) =>
  tx(['snapshots'], 'readonly', (s, out) => collect(out, s.snapshots.get(id)));

export const listSnapshotMeta = () =>
  tx(['snapshotIndex'], 'readonly', (s, out) => collect(out, s.snapshotIndex.getAll())).then((r) => r || []);

export const getAllSnapshots = () =>
  tx(['snapshots'], 'readonly', (s, out) => collect(out, s.snapshots.getAll())).then((r) => r || []);

/** Add or replace one snapshot (record + index entry) atomically. */
export const putSnapshot = (record) =>
  tx(['snapshots', 'snapshotIndex'], 'readwrite', (s) => {
    s.snapshots.put(record);
    s.snapshotIndex.put(metaOf(record));
  });

// ---- Settings --------------------------------------------------------------

export const getSetting = (key, fallback = null) =>
  tx(['settings'], 'readonly', (s, out) => collect(out, s.settings.get(key))).then((r) => (r ? r.value : fallback));

export const setSetting = (key, value) =>
  tx(['settings'], 'readwrite', (s) => { s.settings.put({ key, value }); });

export const getAllSettings = () =>
  tx(['settings'], 'readonly', (s, out) => collect(out, s.settings.getAll())).then((r) => r || []);

// ---- Whole-database operations (atomic) ------------------------------------

/**
 * Replace everything with the given snapshots and settings in ONE transaction.
 * If anything fails, the browser rolls back and the previous data remains.
 */
export const replaceAll = (snapshots, settings) =>
  tx(ALL_STORES, 'readwrite', (s) => {
    ALL_STORES.forEach((n) => s[n].clear());
    for (const rec of snapshots) {
      s.snapshots.put(rec);
      s.snapshotIndex.put(metaOf(rec));
    }
    for (const st of settings) s.settings.put(st);
  });

export const clearAll = () => replaceAll([], []);
