// "Show changes" on the player page: per-player preferences and the rules
// for describing a change between two recorded observations.
//
// Preferences are stored per career (settings key "changes:<careerId>"),
// keyed by player key: { show: boolean, baseline: 'YYYY-MM-DD' | null }.
// baseline null = "earliest observation of this player", which moves
// automatically if an older snapshot is imported later.

import { attributeDirection } from './attributes.js';

export const emptyChangePrefs = () => ({ players: {} });

export function sanitizeChangePrefs(raw) {
  const out = emptyChangePrefs();
  if (!raw || typeof raw !== 'object' || typeof raw.players !== 'object') return out;
  for (const [key, v] of Object.entries(raw.players)) {
    if (!v || typeof v !== 'object') continue;
    out.players[key] = {
      show: v.show === true,
      baseline: typeof v.baseline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.baseline) ? v.baseline : null,
    };
  }
  return out;
}

export const changePrefsFor = (prefs, key) => prefs.players[key] || { show: false, baseline: null };

/**
 * Pick the baseline date: the explicitly chosen one if it is still an earlier
 * observation, otherwise the earliest. `dates` = earlier observation dates,
 * ascending. Returns null when there is no earlier observation.
 */
export function resolveBaseline(dates, chosen) {
  if (!dates.length) return null;
  return chosen && dates.includes(chosen) ? chosen : dates[0];
}

const isNum = (v) => Number.isInteger(v);

/**
 * Describe a change between baseline and current values.
 * direction: 'positive' | 'negative' | 'neutral' (see attributeDirection).
 * Returns { diff|null, text, tone: 'good'|'bad'|'neutral'|'none'|'na', label }.
 */
export function describeChange(current, baseline, direction = 'positive') {
  if (!isNum(current) || !isNum(baseline)) return { diff: null, text: 'n/a', tone: 'na', label: 'change unavailable' };
  const diff = current - baseline;
  if (diff === 0) return { diff, text: '–', tone: 'none', label: 'no change' };
  const text = diff > 0 ? `+${diff}` : `−${Math.abs(diff)}`;
  let tone = 'neutral';
  if (direction === 'positive') tone = diff > 0 ? 'good' : 'bad';
  else if (direction === 'negative') tone = diff > 0 ? 'bad' : 'good';
  return { diff, text, tone, label: `${diff > 0 ? 'up' : 'down'} ${Math.abs(diff)}` };
}

export const describeAttributeChange = (key, current, baseline) =>
  describeChange(current, baseline, attributeDirection(key));
