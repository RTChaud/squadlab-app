// App state: the active snapshot model plus small per-career settings.

import * as db from './data/db.js';
import { importFile } from './data/importer.js';
import { makeSnapshotRecord, buildModel } from './data/snapshot.js';

export const TEAM_SLOTS = [
  { key: 'first', label: 'First Team' },
  { key: 'reserve', label: 'Reserve Team' },
  { key: 'youth', label: 'Youth Team' },
];

const state = {
  model: null,
  squadMap: { first: null, reserve: null, youth: null },
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((fn) => fn(state)); }

export const getModel = () => state.model;
export const getSquadMap = () => ({ ...state.squadMap });

/**
 * Pick the snapshot to show: the career of the most recent import, and within
 * that career the latest in-game date (so importing an older extract later
 * for history does not replace the current view).
 */
function pickLatest(metas) {
  if (!metas.length) return null;
  const byImport = [...metas].sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  const careerId = byImport[0].careerId;
  return metas
    .filter((m) => m.careerId === careerId)
    .sort((a, b) =>
      b.gameDate.localeCompare(a.gameDate) ||
      String(b.exportedAt || '').localeCompare(String(a.exportedAt || '')) ||
      b.importedAt.localeCompare(a.importedAt)
    )[0];
}

async function loadSquadMap(model) {
  const saved = await db.getSetting(`squadMap:${model.careerId}`, null);
  const valid = (id) => {
    const s = id ? model.squadById(id) : null;
    return s && s.kind === 'team' ? id : null;
  };
  if (saved) {
    return { first: valid(saved.first), reserve: valid(saved.reserve), youth: valid(saved.youth) };
  }
  // Only the first team is labelled by the extract itself; reserve/youth stay
  // unassigned until chosen, because their names are placeholders.
  const first = model.squads.find((s) => s.kind === 'team' && s.labelSource === 'first_team_slot');
  return { first: first ? first.id : null, reserve: null, youth: null };
}

async function activate(meta) {
  if (!meta) {
    state.model = null;
    state.squadMap = { first: null, reserve: null, youth: null };
    return;
  }
  const record = await db.getSnapshot(meta.id);
  state.model = buildModel(record);
  state.squadMap = await loadSquadMap(state.model);
}

export async function init() {
  const metas = await db.listSnapshotMeta();
  await activate(pickLatest(metas));
  emit();
}

/** Import a File. Resolves to { warnings, shownIsImported } or throws ImportError. */
export async function importExtract(file) {
  const { data, warnings } = await importFile(file);
  const record = makeSnapshotRecord(data, file.name || '');
  try {
    await db.putSnapshot(record);
  } catch (e) {
    throw new Error(`The file is valid but could not be saved locally: ${e?.message || e}`);
  }
  const metas = await db.listSnapshotMeta();
  const latest = pickLatest(metas);
  await activate(latest);
  emit();
  return { warnings, shownIsImported: latest?.id === record.id };
}

export async function setSquadMapping(slotKey, squadId) {
  if (!state.model) return;
  state.squadMap = { ...state.squadMap, [slotKey]: squadId || null };
  await db.setSetting(`squadMap:${state.model.careerId}`, state.squadMap);
  emit();
}

export async function getLastShortlist() {
  if (!state.model) return null;
  return db.getSetting(`lastShortlist:${state.model.careerId}`, null);
}

export function setLastShortlist(id) {
  if (!state.model) return Promise.resolve();
  return db.setSetting(`lastShortlist:${state.model.careerId}`, id);
}
