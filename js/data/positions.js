// Converts the extract's position codes (e.g. "DR", "WBR", "AMC", "STC")
// into Football Manager style abbreviations, grouped the way FM shows them:
//   ["DR", "DC", "WBR"]  ->  "D (RC), WB (R)"

// code -> [group, side]; side is null for single-slot positions.
const CODE_MAP = {
  GK: ['GK', null],
  SW: ['SW', null],
  DR: ['D', 'R'], DL: ['D', 'L'], DC: ['D', 'C'],
  WBR: ['WB', 'R'], WBL: ['WB', 'L'],
  DM: ['DM', null],
  MR: ['M', 'R'], ML: ['M', 'L'], MC: ['M', 'C'],
  AMR: ['AM', 'R'], AML: ['AM', 'L'], AMC: ['AM', 'C'],
  STC: ['ST', 'C'], ST: ['ST', 'C'],
};

// Pitch order, back to front.
const GROUP_ORDER = ['GK', 'SW', 'D', 'WB', 'DM', 'M', 'AM', 'ST'];
const SIDE_ORDER = ['R', 'L', 'C'];

/** Sort key for a single code (lower = further back). Unknown codes sort last. */
export function positionRank(code) {
  const m = CODE_MAP[String(code).toUpperCase()];
  if (!m) return 999;
  const side = m[1] ? SIDE_ORDER.indexOf(m[1]) : 0;
  return GROUP_ORDER.indexOf(m[0]) * 10 + side;
}

/** Format a list of codes as FM-style text. Returns '' for an empty list. */
export function formatPositions(codes) {
  if (!Array.isArray(codes) || codes.length === 0) return '';
  const groups = new Map();
  const unknown = [];
  for (const raw of codes) {
    const code = String(raw).toUpperCase();
    const m = CODE_MAP[code];
    if (!m) { if (!unknown.includes(code)) unknown.push(code); continue; }
    const [group, side] = m;
    if (!groups.has(group)) groups.set(group, new Set());
    if (side) groups.get(group).add(side);
  }
  const parts = GROUP_ORDER.filter((g) => groups.has(g)).map((g) => {
    const sides = SIDE_ORDER.filter((s) => groups.get(g).has(s)).join('');
    return sides ? `${g} (${sides})` : g;
  });
  return [...parts, ...unknown].join(', ');
}

/**
 * Natural positions in the main text, accomplished ones (that aren't already
 * natural) kept separate so the UI can show them more quietly.
 */
export function describePositions(player) {
  const natural = Array.isArray(player.natural_positions) ? player.natural_positions : [];
  const naturalSet = new Set(natural.map((c) => String(c).toUpperCase()));
  const accomplished = (Array.isArray(player.accomplished_positions) ? player.accomplished_positions : [])
    .filter((c) => !naturalSet.has(String(c).toUpperCase()));
  const ranks = natural.map(positionRank);
  return {
    natural: formatPositions(natural),
    accomplished: formatPositions(accomplished),
    sortKey: ranks.length ? Math.min(...ranks) : 999,
  };
}

// ---- Familiarity (the extract's `positions` block, 1–20) -----------------------------

/** Familiarity codes the app shows, back to front (SW is no longer used). */
export const PITCH_CODES = ['gk', 'dr', 'dc', 'dl', 'wbr', 'wbl', 'dm', 'mr', 'mc', 'ml', 'amr', 'amc', 'aml', 'stc'];

/** Familiarity colour bands (.f1–.f6), shared by the profile pitch and lists. */
export const FAM_BANDS = [
  { cls: 'f1', min: 1, max: 1 },
  { cls: 'f2', min: 2, max: 5 },
  { cls: 'f3', min: 6, max: 9 },
  { cls: 'f4', min: 10, max: 14 },
  { cls: 'f5', min: 15, max: 17 },
  { cls: 'f6', min: 18, max: 20 },
];
export const famBand = (v) => (Number.isInteger(v) ? FAM_BANDS.find((b) => v >= b.min && v <= b.max) || null : null);
