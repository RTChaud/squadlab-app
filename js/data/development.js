// Development leaderboard and snapshot timeline rules, from the career's
// metrics (one compact record per stored snapshot; see players.js). Pure
// functions: no storage, no DOM.
//
// Player identity is the career-scoped key from players.js, so a different
// exporter career_id or player_key prefix never splits a player's history.

export const WINDOWS = [
  { id: 'overall', label: 'Overall', months: null },
  { id: '12m', label: '12 months', months: 12 },
  { id: '3m', label: '3 months', months: 3 },
  { id: '1m', label: '1 month', months: 1 },
];

export const SQUAD_FILTERS = [
  { id: 'all', label: 'All squads' },
  { id: 'first', label: 'First team' },
  { id: 'reserve', label: 'Reserves' },
  { id: 'youth', label: 'Youth' },
  { id: 'loan', label: 'Out on loan' },
];

export const SQUAD_LABEL = { first: 'First team', reserve: 'Reserves', youth: 'Youth', loan: 'Out on loan' };

const isInt = Number.isInteger;
const asc = (list) => [...list].sort((a, b) => a.gameDate.localeCompare(b.gameDate));

/** "2026-08-31" minus n months → "2026-05-31"; the day is clamped to the month's length. */
export function monthsBefore(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) - n;
  const ny = Math.floor(total / 12), nm = total % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${String(ny).padStart(4, '0')}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/**
 * The player's current spell at the club: the unbroken run of snapshots,
 * ending at the latest one, in which he is recorded as a club player (out on
 * loan included). A snapshot where he was not ours (e.g. only shortlisted) or
 * not recorded ends the run.
 */
function currentSpell(byDate, key) {
  const spell = [];
  for (let i = byDate.length - 1; i >= 0; i--) {
    const row = byDate[i].rows.get(key);
    if (!row || !row.own) break;
    spell.unshift({ gameDate: byDate[i].gameDate, ca: isInt(row.ca) ? row.ca : null });
  }
  return spell;
}

/**
 * CA-gained ranking for the latest snapshot's club players.
 * Returns { latestDate, careerStart, cutoff, rows }, rows ranked by change:
 *   { key, squad, status: 'ok'|'insufficient', start, end, change, note }
 *   start/end: { gameDate, ca }; note: 'joined' | 'coverage' | null
 *   'joined'   — he became a club player after the career's first snapshot
 *                (Since joining); his spell starts inside the window
 *   'coverage' — the career's recorded history starts inside the window
 */
export function developmentBoard(metrics, windowId = 'overall') {
  const list = asc(metrics);
  if (!list.length) return { latestDate: null, careerStart: null, cutoff: null, rows: [] };
  const byDate = list.map((m) => ({ gameDate: m.gameDate, rows: new Map(m.players.map((r) => [r.key, r])) }));
  const latest = list[list.length - 1];
  const careerStart = list[0].gameDate;
  const win = WINDOWS.find((w) => w.id === windowId) || WINDOWS[0];
  const cutoff = win.months ? monthsBefore(latest.gameDate, win.months) : null;

  const rows = [];
  for (const r of latest.players) {
    if (!r.own) continue;
    const spell = currentSpell(byDate, r.key);
    const joined = spell[0].gameDate > careerStart;
    const obs = spell.filter((x) => x.ca !== null);
    const end = spell[spell.length - 1];
    const base = { key: r.key, name: r.name ?? null, squad: r.squad ?? null, joined };
    if (end.ca === null || obs.length < 2) {
      rows.push({ ...base, status: 'insufficient', start: obs[0] ?? null, end, change: null, note: null, observations: obs.length });
      continue;
    }
    let start, note = null;
    if (!cutoff) {
      start = obs[0];
      if (joined) note = 'joined';
    } else {
      start = obs.filter((x) => x.gameDate <= cutoff).pop() || null;
      if (!start) { start = obs[0]; note = joined ? 'joined' : 'coverage'; }
    }
    rows.push({ ...base, status: 'ok', start, end, change: end.ca - start.ca, note, observations: obs.length });
  }
  rows.sort((a, b) => {
    if ((a.status === 'ok') !== (b.status === 'ok')) return a.status === 'ok' ? -1 : 1;
    if (a.status === 'ok' && b.change !== a.change) return b.change - a.change;
    return (b.end.ca ?? -1) - (a.end.ca ?? -1);
  });
  return { latestDate: latest.gameDate, careerStart, cutoff, rows };
}

export const filterBySquad = (rows, squadId) => (squadId && squadId !== 'all' ? rows.filter((r) => r.squad === squadId) : rows);

// ---- Snapshots timeline --------------------------------------------------------

/** In-game season of a date: FM's European seasons run July–June ("2026/27"). */
export function seasonOf(iso) {
  const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7));
  const start = m >= 7 ? y : y - 1;
  return { id: String(start), label: `${start}/${String((start + 1) % 100).padStart(2, '0')}` };
}

/** Snapshot metadata grouped by season, newest season and date first. */
export function groupBySeason(history) {
  const groups = new Map();
  for (const m of [...history].sort((a, b) => b.gameDate.localeCompare(a.gameDate))) {
    const s = seasonOf(m.gameDate);
    if (!groups.has(s.id)) groups.set(s.id, { ...s, items: [] });
    groups.get(s.id).items.push(m);
  }
  return [...groups.values()];
}

/** Club players (incl. out on loan) recorded in one snapshot's metrics. */
export const clubCount = (metrics) => metrics.players.filter((r) => r.own).length;

/**
 * Compare two snapshots' metrics by club membership and stable identity.
 * Moving between club squads or going out on loan is neither a signing nor a
 * departure. Returns { joined, left, gains } (keys + rows; gains sorted, CA up first).
 */
export function compareSnapshots(earlier, later) {
  const a = new Map(earlier.players.map((r) => [r.key, r]));
  const b = new Map(later.players.map((r) => [r.key, r]));
  const joined = [], left = [], both = [];
  for (const [key, r] of b) if (r.own && !a.get(key)?.own) joined.push({ key, before: a.get(key) || null, after: r });
  for (const [key, r] of a) if (r.own && !b.get(key)?.own) left.push({ key, before: r, after: b.get(key) || null });
  for (const [key, r] of b) {
    const old = a.get(key);
    if (r.own && old?.own && isInt(r.ca) && isInt(old.ca)) both.push({ key, before: old, after: r, change: r.ca - old.ca });
  }
  both.sort((x, y) => y.change - x.change || y.after.ca - x.after.ca);
  const byCa = (x, y) => (y.after?.ca ?? y.before?.ca ?? -1) - (x.after?.ca ?? x.before?.ca ?? -1);
  return { joined: joined.sort(byCa), left: left.sort((x, y) => (y.before.ca ?? -1) - (x.before.ca ?? -1)), gains: both };
}
