// Turns a stored extract into an in-memory model with lookups.
// The original JSON is always kept in `model.raw`; nothing is dropped.

import { describePositions } from './positions.js';
import { persistentId, linkRecordPlayers } from './players.js';

/**
 * Build the IndexedDB record for a freshly imported extract.
 * `careerId` is the SquadLab career it is stored in (the extract's own
 * career_id is kept in the untouched data and in `sourceCareerId`);
 * `uidLinks` maps uids of players without a unique_id to existing players.
 */
export function makeSnapshotRecord(data, fileName = '', { careerId = data.career_id, uidLinks = null } = {}) {
  const links = uidLinks && Object.keys(uidLinks).length ? uidLinks : null;
  return linkRecordPlayers({
    // One snapshot per career and in-game date.
    id: `${careerId}|${data.game_date}`,
    careerId,
    sourceCareerId: data.career_id,
    ...(links ? { uidLinks: links } : {}),
    gameDate: data.game_date,
    exportedAt: data.exported_at_utc || null,
    clubName: data.club?.name ?? null,
    managerName: data.club?.manager_name ?? null,
    playerCount: Array.isArray(data.players) ? data.players.length : 0,
    fileName,
    importedAt: new Date().toISOString(),
    data,
  });
}

/** Built-in Shortlists view of every player in the snapshot (never an imported id). */
export const ALL_LIST_ID = 'squadlab:all';

/** Shortlists hidden from the app (data is still stored and backed up). */
export const HIDDEN_SHORTLIST_IDS = new Set(['default']);

function squadKind(s) {
  if (Number.isInteger(s.team_id)) return 'team';
  if (s.id === 'out_on_loan') return 'loan';
  if (s.id === 'unassigned') return 'unassigned';
  return 'other';
}

export function buildModel(record) {
  linkRecordPlayers(record);
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

  // Every player available for the career in this snapshot (squads, shortlists
  // and anyone else exported), once each by stable player ID. Rebuilt with the
  // model, so it follows each import.
  const allPlayers = [];
  const seenIds = new Set();
  for (const p of data.players) {
    const id = persistentId(p) ?? `uid:${p.uid}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    allPlayers.push(p);
  }

  // FM's automatic "Default shortlist" is kept in the data but not shown.
  const visibleShortlists = shortlists.filter((l) => !HIDDEN_SHORTLIST_IDS.has(l.id));

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
    allPlayers,
    squads,
    shortlists,
    visibleShortlists,
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
    pid: persistentId(p),
    firstName: str(p.first_name),
    lastName: str(p.last_name),
    age: intOrNull(p.age),
    ca: ca !== null && ca >= 0 ? ca : null,
    pa: pa !== null && pa > 0 ? pa : null,
    positions: describePositions(p),
  };
}

// ---- Squad widgets -------------------------------------------------------------
//
// The three widgets are linked to imported squads through the extractor's
// team_slot metadata (0 = first team, 1 = reserves, 2 = youth). Membership is
// read only from each squad's player_uids — never inferred from player data.

export const TEAM_SLOTS = [
  { key: 'first', label: 'First Team', short: 'First', slot: 0 },
  { key: 'reserve', label: 'Reserve Team', short: 'Reserve', slot: 1 },
  { key: 'youth', label: 'Youth Team', short: 'Youth', slot: 2 },
  // Linked to the extract's "Out on loan" group (id out_on_loan), not a team slot.
  { key: 'loan', label: 'Out on Loan', short: 'Loan', kind: 'loan' },
];

/**
 * For each widget: { key, label, slot, squad, players, issues[], fatal }.
 * `fatal` means no squad could be linked; `issues` explain any inconsistency.
 */
export function resolveTeams(model) {
  const result = TEAM_SLOTS.map((t) => {
    const isLoan = t.kind === 'loan';
    const matches = isLoan
      ? model.squads.filter((s) => s.kind === 'loan')
      : model.squads.filter((s) => s.kind === 'team' && s.teamSlot === t.slot);
    const base = { ...t, squad: null, players: [], issues: [], fatal: false };
    if (isLoan && matches.length !== 1) {
      return { ...base, fatal: true, issues: [matches.length ? 'This snapshot has more than one Out on loan group.' : 'This snapshot has no Out on loan group.'] };
    }
    if (matches.length === 0) {
      return { ...base, fatal: true, issues: [`This snapshot has no squad with team_slot ${t.slot}, so the ${t.label} cannot be linked.`] };
    }
    if (matches.length > 1) {
      return { ...base, fatal: true, issues: [`${matches.length} squads share team_slot ${t.slot} (${matches.map((m) => m.name).join(', ')}), so the ${t.label} is ambiguous.`] };
    }
    const squad = matches[0];
    const players = model.resolve(squad.playerUids);
    const issues = [];
    const missing = squad.playerUids.filter((u) => !model.playersByUid.has(u));
    if (missing.length) {
      issues.push(`${missing.length} member${missing.length === 1 ? ' is' : 's are'} listed in this squad but missing from the players data (uid ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''}).`);
    }
    // Loaned players play for another club's team, so team_id is only checked for our own teams.
    const mismatched = isLoan ? [] : players.filter((p) => Number.isInteger(p.team_id) && p.team_id !== squad.teamId);
    if (mismatched.length) {
      issues.push(`${mismatched.length} player${mismatched.length === 1 ? '' : 's'} in this squad ${mismatched.length === 1 ? 'has' : 'have'} a different team_id on ${mismatched.length === 1 ? 'its' : 'their'} own record.`);
    }
    return { ...base, squad, players, issues };
  });

  // A player should belong to only one of these groups.
  const seen = new Map();
  for (const t of result) for (const p of t.players) {
    if (!seen.has(p.uid)) seen.set(p.uid, []);
    seen.get(p.uid).push(t);
  }
  for (const [, teams] of seen) {
    if (teams.length > 1) for (const t of teams) {
      const msg = 'Some players are listed in more than one group.';
      if (!t.issues.includes(msg)) t.issues.push(msg);
    }
  }
  return result;
}

/** "2026-04-24" -> "24 Apr 2026" without timezone drift. */
export function formatGameDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '—';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
