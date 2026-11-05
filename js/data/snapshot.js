// Turns a stored extract into an in-memory model with lookups.
// The original JSON is always kept in `model.raw`; nothing is dropped.

import { describePositions } from './positions.js';

/** Build the IndexedDB record for a freshly imported extract. */
export function makeSnapshotRecord(data, fileName = '') {
  return {
    // Re-importing the exact same extract replaces it rather than duplicating.
    id: `${data.career_id}|${data.game_date}|${data.exported_at_utc || ''}`,
    careerId: data.career_id,
    gameDate: data.game_date,
    exportedAt: data.exported_at_utc || null,
    clubName: data.club?.name ?? null,
    managerName: data.club?.manager_name ?? null,
    playerCount: Array.isArray(data.players) ? data.players.length : 0,
    fileName,
    importedAt: new Date().toISOString(),
    data,
  };
}

function squadKind(s) {
  if (Number.isInteger(s.team_id)) return 'team';
  if (s.id === 'out_on_loan') return 'loan';
  if (s.id === 'unassigned') return 'unassigned';
  return 'other';
}

export function buildModel(record) {
  const data = record.data;

  // One underlying record per player; squads and shortlists only reference uids.
  const playersByUid = new Map();
  for (const p of data.players) playersByUid.set(p.uid, p);

  const squads = data.squads.map((s) => ({
    id: s.id,
    name: s.name || s.id,
    teamId: s.team_id ?? null,
    teamSlot: s.team_slot ?? null,
    labelSource: s.label_source ?? null,
    kind: squadKind(s),
    playerUids: s.player_uids,
  }));

  const shortlists = data.shortlists.map((l) => ({
    id: l.id,
    name: typeof l.name === 'string' && l.name !== '' ? l.name : l.id,
    sourceName: l.source_name ?? null,
    playerUids: l.player_uids,
  }));

  // Reverse index: which shortlists each player belongs to (for future profiles).
  const shortlistsByUid = new Map();
  for (const l of shortlists) {
    for (const uid of l.playerUids) {
      if (!shortlistsByUid.has(uid)) shortlistsByUid.set(uid, []);
      shortlistsByUid.get(uid).push(l.id);
    }
  }

  return {
    id: record.id,
    careerId: record.careerId,
    gameDate: data.game_date,
    exportedAt: data.exported_at_utc ?? null,
    club: data.club,
    raw: data,
    playersByUid,
    squads,
    shortlists,
    shortlistsByUid,
    squadById: (id) => squads.find((s) => s.id === id) || null,
    shortlistById: (id) => shortlists.find((l) => l.id === id) || null,
    /** Resolve uids to player records, skipping any that are missing. */
    resolve(uids) {
      const out = [];
      for (const uid of uids) {
        const p = playersByUid.get(uid);
        if (p) out.push(p);
      }
      return out;
    },
  };
}

const intOrNull = (v) => (Number.isInteger(v) ? v : null);

/**
 * The values the player list shows. Unavailable values are null (rendered "—").
 * A negative or zero potential in FM is a range code, not a real PA, so it is
 * treated as unavailable rather than guessed.
 */
export function playerSummary(p) {
  const ca = intOrNull(p.ability?.current);
  const pa = intOrNull(p.ability?.potential);
  const str = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
  return {
    uid: p.uid,
    firstName: str(p.first_name),
    lastName: str(p.last_name),
    ca: ca !== null && ca >= 0 ? ca : null,
    pa: pa !== null && pa > 0 ? pa : null,
    positions: describePositions(p),
  };
}

/** "2026-04-24" -> "24 Apr 2026" without timezone drift. */
export function formatGameDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '—';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
