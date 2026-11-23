// Club identity for the Home banner: crest image and accent colours, from
// data/clubs.json (keyed by the club's FM unique_id, falling back to its name).
// Nothing here is required: unknown clubs get neutral accents and the
// SquadLab logo as their crest.

const CONFIG_URL = 'data/clubs.json';
export const FALLBACK_CREST = 'icons/logo-mark.png';

let loading = null;

function load() {
  if (!loading) {
    loading = fetch(CONFIG_URL, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((j) => (j && typeof j.clubs === 'object' && j.clubs ? j.clubs : {}));
  }
  return loading;
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** "#d12" / "#dd1122" → "221, 17, 34" (for rgba()). */
export function hexToRgb(hex) {
  let x = hex.slice(1);
  if (x.length === 3) x = x.split('').map((c) => c + c).join('');
  const n = parseInt(x, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

/**
 * Identity for a club ({ unique_id, uid, name } from the extract).
 * Resolves { crest, crestIsFallback, colours: [rgb, rgb] | [] }.
 */
export async function clubIdentity(club) {
  const clubs = await load();
  const id = club?.unique_id ?? club?.uid;
  let entry = id !== undefined && id !== null ? clubs[String(id)] : null;
  if (!entry && club?.name) entry = Object.values(clubs).find((c) => c?.name === club.name) || null;
  const colours = (Array.isArray(entry?.colours) ? entry.colours : []).filter((c) => typeof c === 'string' && HEX.test(c)).slice(0, 2).map(hexToRgb);
  const crest = typeof entry?.crest === 'string' && entry.crest.trim() ? entry.crest.trim() : null;
  return { crest: crest || FALLBACK_CREST, crestIsFallback: !crest, colours };
}
