// App state: one active career, its snapshot history, and the newest snapshot
// as the in-memory model. All data operations go through here.

import * as db from './data/db.js';
import {
  readJsonFile, validateSnapshot, validateBackup, ImportError,
  BACKUP_FORMAT, BACKUP_VERSION,
} from './data/importer.js';
import { makeSnapshotRecord, buildModel } from './data/snapshot.js';

const state = {
  career: null,   // { careerId, createdAt }
  history: [],    // snapshot metadata for the active career, newest first
  model: null,    // newest snapshot
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((fn) => fn(state)); }

export const getModel = () => state.model;
export const getCareer = () => state.career;
export const getHistory = () => [...state.history];

const byDateDesc = (a, b) => b.gameDate.localeCompare(a.gameDate);

async function reload() {
  let career = await db.getSetting('career', null);
  const metas = await db.listSnapshotMeta();
  if (!career && metas.length) {
    // Data without a career record (shouldn't happen): adopt the latest import.
    const latest = [...metas].sort((a, b) => b.importedAt.localeCompare(a.importedAt))[0];
    career = { careerId: latest.careerId, createdAt: latest.importedAt };
    await db.setSetting('career', career);
  }
  state.career = career;
  state.history = career ? metas.filter((m) => m.careerId === career.careerId).sort(byDateDesc) : [];
  state.model = state.history.length ? buildModel(await db.getSnapshot(state.history[0].id)) : null;
  emit();
}

export const init = reload;

// ---- FM snapshot import ------------------------------------------------------

/**
 * Read and validate a snapshot, and work out how it relates to stored data.
 * Nothing is written here.
 * status: 'first' | 'new' | 'older' | 'duplicate' | 'sameDate' | 'otherCareer'
 */
export async function prepareSnapshot(file) {
  const obj = await readJsonFile(file, 'snapshot');
  const { data, warnings } = validateSnapshot(obj);
  const out = { data, warnings, fileName: file.name || '' };

  if (!state.career) return { ...out, status: 'first' };
  if (data.career_id !== state.career.careerId) return { ...out, status: 'otherCareer' };

  const id = db.snapshotId(data.career_id, data.game_date);
  const existing = state.history.find((m) => m.id === id);
  if (existing) {
    const rec = await db.getSnapshot(id);
    const same = rec && JSON.stringify(rec.data) === JSON.stringify(data);
    return { ...out, status: same ? 'duplicate' : 'sameDate', existing };
  }
  const newest = state.history[0];
  return { ...out, status: newest && data.game_date < newest.gameDate ? 'older' : 'new' };
}

/** Add (or replace the same-date) snapshot to the active career's history. */
export async function addSnapshot(prepared) {
  const { data, fileName } = prepared;
  if (state.career && data.career_id !== state.career.careerId) {
    throw new ImportError('This snapshot belongs to a different career.');
  }
  const record = makeSnapshotRecord(data, fileName);
  if (!state.career) {
    // First snapshot: create the career and its first snapshot together.
    await db.replaceAll([record], [{ key: 'career', value: { careerId: data.career_id, createdAt: record.importedAt } }]);
  } else {
    await db.putSnapshot(record);
  }
  await reload();
  return { shownIsImported: state.model?.id === record.id };
}

/** Wipe all data and start a new career from this snapshot (one transaction). */
export async function startNewCareer(prepared) {
  const record = makeSnapshotRecord(prepared.data, prepared.fileName);
  await db.replaceAll([record], [{ key: 'career', value: { careerId: record.careerId, createdAt: record.importedAt } }]);
  await reload();
}

// ---- App backup ----------------------------------------------------------------

const slug = (s) => String(s || 'career')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'career';

/** Build the complete backup for the active career. Returns { blob, filename, summary }. */
export async function buildBackup() {
  if (!state.career) throw new Error('There is no data to back up yet.');
  const careerId = state.career.careerId;
  const snapshots = (await db.getAllSnapshots()).filter((r) => r.careerId === careerId).sort(byDateDesc).reverse();
  const settings = await db.getAllSettings();
  const now = new Date();
  const newest = snapshots[snapshots.length - 1];

  const backup = {
    format: BACKUP_FORMAT,
    backup_version: BACKUP_VERSION,
    exported_at: now.toISOString(),
    app: { name: 'SquadLab', db_version: 2 },
    career: {
      careerId,
      createdAt: state.career.createdAt ?? null,
      clubName: newest?.data?.club?.name ?? null,
      managerName: newest?.data?.club?.manager_name ?? null,
      snapshotCount: snapshots.length,
      firstGameDate: snapshots[0]?.gameDate ?? null,
      lastGameDate: newest?.gameDate ?? null,
    },
    snapshots,
    settings,
  };

  const date = now.toISOString().slice(0, 10);
  const filename = `SquadLab_${slug(backup.career.clubName)}_backup_${date}.json`;
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  return { blob, filename, summary: backup.career };
}

/** Read + fully validate a backup file. Nothing is written here. */
export async function prepareBackup(file) {
  const obj = await readJsonFile(file, 'backup');
  return validateBackup(obj);
}

/** Replace all app data with the backup, atomically. */
export async function restoreBackup(backup) {
  const settings = backup.settings.filter((s) => s.key !== 'career');
  settings.push({ key: 'career', value: { createdAt: null, ...(backup.settings.find((s) => s.key === 'career')?.value || {}), careerId: backup.career.careerId } });
  await db.replaceAll(backup.snapshots, settings);
  await reload();
}

export async function resetAll() {
  await db.clearAll();
  await reload();
}

// ---- Small per-career settings ---------------------------------------------------

export async function getLastShortlist() {
  if (!state.career) return null;
  return db.getSetting(`lastShortlist:${state.career.careerId}`, null);
}

export function setLastShortlist(id) {
  if (!state.career) return Promise.resolve();
  return db.setSetting(`lastShortlist:${state.career.careerId}`, id);
}
