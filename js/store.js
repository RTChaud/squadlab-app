// App state: one active career, its snapshot history, and the newest snapshot
// as the in-memory model. All data operations go through here.

import * as db from './data/db.js';
import {
  readJsonFile, validateSnapshot, validateBackup, ImportError,
  BACKUP_FORMAT, BACKUP_VERSION,
} from './data/importer.js';
import { makeSnapshotRecord, buildModel } from './data/snapshot.js';
import { buildMetrics, keyFor, findInSnapshot, playerHistory, playerKey } from './data/players.js';
import * as Tags from './data/tags.js';

const state = {
  career: null,   // { careerId, createdAt }
  history: [],    // snapshot metadata for the active career, newest first
  model: null,    // newest snapshot
  metrics: null,  // cached metrics for the active career (loaded on demand)
  tags: Tags.emptyTags(), // app-created player tags for the active career
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
  state.metrics = null;
  state.tags = career ? Tags.sanitizeTags(await db.getSetting(tagsKey(career), null)) : Tags.emptyTags();
  await ensureMetrics(metas);
  emit();
}

const tagsKey = (career) => `tags:${career.careerId}`;

/**
 * Make sure every stored snapshot has its derived metrics (e.g. data stored
 * before this version), and drop metrics whose snapshot no longer exists.
 */
async function ensureMetrics(metas) {
  const have = new Set(await db.listMetricIds());
  const want = new Set(metas.map((m) => m.id));
  for (const m of metas) {
    if (have.has(m.id)) continue;
    const rec = await db.getSnapshot(m.id);
    if (rec) await db.putMetrics(buildMetrics(rec));
  }
  const orphans = [...have].filter((id) => !want.has(id));
  if (orphans.length) await db.deleteMetrics(orphans);
}

async function careerMetrics() {
  if (!state.career) return [];
  if (!state.metrics) {
    state.metrics = (await db.listMetrics()).filter((m) => m.careerId === state.career.careerId);
  }
  return state.metrics;
}

// ---- Players -------------------------------------------------------------------

/**
 * Resolve a player by persistent ID. Uses the newest in-game snapshot; if the
 * player is not in it, falls back to their last recorded snapshot and marks
 * the result as historical (current: false).
 * Returns { player, model, current, latestDate } or null.
 */
export async function getPlayerProfile(pid) {
  if (!state.model) return null;
  const key = keyFor(state.career.careerId, pid);
  const latest = findInSnapshot(state.model.raw, key);
  if (latest) return { player: latest, model: state.model, current: true, latestDate: state.model.gameDate };

  const metrics = await careerMetrics();
  const lastSeen = [...metrics]
    .sort((a, b) => b.gameDate.localeCompare(a.gameDate))
    .find((m) => m.players.some((p) => p.key === key));
  if (!lastSeen) return null;
  const model = buildModel(await db.getSnapshot(lastSeen.id));
  return { player: findInSnapshot(model.raw, key), model, current: false, latestDate: state.model.gameDate };
}

/** Chronological observations for one player across the active career. */
export async function getPlayerHistory(pid) {
  if (!state.career) return [];
  return playerHistory(await careerMetrics(), state.career.careerId, keyFor(state.career.careerId, pid));
}

export const getPref = (key, fallback = null) => db.getSetting(`pref:${key}`, fallback);
export const setPref = (key, value) => db.setSetting(`pref:${key}`, value);

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

// ---- Tags (app-created; never touched by FM snapshot imports) --------------------

export const listTags = () => Tags.listTags(state.tags);
export const tagsForPlayer = (key) => Tags.tagsForPlayer(state.tags, key);
export const tagById = (id) => state.tags.tags[id] || null;
export const playerKeyOf = (p) => (state.career ? playerKey(p, state.career.careerId) : null);

async function saveTags(next) {
  await db.setSetting(tagsKey(state.career), next);
  state.tags = next;
  emit();
}

/** Assign (creating if needed) a tag by name. Resolves { tag, created, already }. */
export async function addTagToPlayer(key, name) {
  const r = Tags.assignTag(state.tags, key, name);
  if (!r.already) await saveTags(r.state);
  return r;
}

/** Remove one tag from one player (deletes the tag if it was its last player). */
export async function removeTagFromPlayer(key, tagId) {
  const r = Tags.unassignTag(state.tags, key, tagId);
  if (r.state !== state.tags) await saveTags(r.state);
  return r;
}

/**
 * Players in a tag, once each. Uses the newest snapshot when the player is in
 * it; otherwise their last recorded snapshot (current: false, gameDate set).
 * Resolves [{ player, current, gameDate }].
 */
export async function getTagMembers(tagId) {
  if (!state.model) return [];
  const keys = Tags.playerKeysForTag(state.tags, tagId);
  const out = [];
  const missing = [];
  for (const key of keys) {
    const p = findInSnapshot(state.model.raw, key);
    if (p) out.push({ player: p, current: true, gameDate: state.model.gameDate });
    else missing.push(key);
  }
  if (missing.length) {
    const metrics = [...(await careerMetrics())].sort((a, b) => b.gameDate.localeCompare(a.gameDate));
    const cache = new Map();
    for (const key of missing) {
      const m = metrics.find((x) => x.players.some((p) => p.key === key));
      if (!m) continue; // not in any stored snapshot: keep the tag, nothing to show
      if (!cache.has(m.id)) cache.set(m.id, await db.getSnapshot(m.id));
      const p = findInSnapshot(cache.get(m.id).data, key);
      if (p) out.push({ player: p, current: false, gameDate: m.gameDate });
    }
  }
  return out;
}

export async function getLastTag() {
  return state.career ? db.getSetting(`lastTag:${state.career.careerId}`, null) : null;
}
export function setLastTag(id) {
  return state.career ? db.setSetting(`lastTag:${state.career.careerId}`, id) : Promise.resolve();
}
