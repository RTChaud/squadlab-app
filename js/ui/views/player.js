// Shared player profile — opened from any squad or shortlist.

import { h, icon, orDash, DASH } from '../dom.js';
import { getPlayerProfile } from '../../store.js';
import { formatGameDate, resolveTeams } from '../../data/snapshot.js';
import { describePositions, formatPositions } from '../../data/positions.js';
import { persistentId } from '../../data/players.js';
import { nationName } from '../../data/nations.js';
import {
  ATTRIBUTE_GROUPS, HIDDEN_ATTRS, PERSONALITY_ATTRS, BAND_LEGEND,
  attrBand, describeTraits, intOrNull,
} from '../../data/attributes.js';
import { backTarget, linkWithFrom } from '../../router.js';

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function displayName(p) {
  const first = str(p.first_name), last = str(p.last_name), common = str(p.common_name);
  const full = [first, last].filter(Boolean).join(' ');
  // FM shows the common name (e.g. "Endrick") when one exists.
  return { main: common || full || str(p.name) || DASH, full: common && full && common !== full ? full : null };
}

function footText(p) {
  const l = intOrNull(p.left_foot), r = intOrNull(p.right_foot);
  if (l === null || r === null) return DASH;
  const pref = l === r ? 'Both' : r > l ? 'Right' : 'Left';
  return `${pref} (L ${l} · R ${r})`;
}

/**
 * FM's personality label (e.g. "Model Professional"). The extract currently
 * holds only the underlying values, so the label is shown only if the
 * extractor provides it (as `personality_label`) — never derived here.
 */
function personalityText(p) {
  const label = str(p.personality_label);
  return label ? { text: label } : { text: DASH, note: 'Label not in extract' };
}

function nationalityText(p) {
  const ids = [p.nation_id, ...(Array.isArray(p.second_nation_ids) ? p.second_nation_ids : [])].filter(Number.isInteger);
  if (!ids.length) return { text: DASH };
  const names = ids.map(nationName);
  if (names.every(Boolean)) return { text: names.map((n) => (n.flag ? `${n.flag} ${n.name}` : n.name)).join(', ') };
  return { text: 'Nationality unavailable', note: `FM nation ID${ids.length > 1 ? 's' : ''} ${ids.join(', ')}` };
}

/** Club, plus the internal squad from the displayed snapshot's membership lists. */
function clubAndSquad(p, model) {
  const club = str(p.club_name);
  const clubText = club
    ? (p.on_loan && str(p.loan_parent_club_name) ? `${club} (on loan from ${p.loan_parent_club_name})` : club)
    : DASH;
  const squad = model.squads.find((s) => s.playerUids.includes(p.uid));
  let squadText = null;
  if (squad) {
    const team = resolveTeams(model).find((t) => t.squad && t.squad.id === squad.id);
    squadText = team ? team.label : squad.name;
  }
  return { clubText, squadText };
}

// ---- Sections ----------------------------------------------------------------------

function header(p, model) {
  const name = displayName(p);
  const pos = describePositions(p);
  const ca = intOrNull(p.ability?.current);
  const paRaw = intOrNull(p.ability?.potential);
  const pa = paRaw !== null && paRaw > 0 ? paRaw : null;
  const age = intOrNull(p.age);

  return h('div', { class: 'profile-head' },
    h('div', { class: 'profile-id' },
      h('h2', { class: 'profile-name' }, name.main),
      name.full ? h('p', { class: 'profile-fullname' }, name.full) : null,
      h('p', { class: 'profile-meta' },
        h('span', {}, age !== null ? `Age ${age}` : 'Age —'),
        h('span', { class: 'sep' }, '·'),
        h('span', {}, pos.natural || DASH),
        pos.accomplished ? h('span', { class: 'muted' }, ` · ${pos.accomplished}`) : null),
    ),
    h('div', { class: 'badges' },
      h('div', { class: 'badge' }, h('span', { class: 'badge-label' }, 'CA'), h('span', { class: 'badge-value' }, orDash(ca))),
      h('div', { class: 'badge badge-pa' }, h('span', { class: 'badge-label' }, 'PA'), h('span', { class: 'badge-value' }, orDash(pa))),
    ),
  );
}

function details(p, model, current) {
  const { clubText, squadText } = clubAndSquad(p, model);
  const nat = nationalityText(p);
  const row = (k, v, note) => h('div', { class: 'detail' },
    h('span', { class: 'detail-k' }, k),
    h('span', { class: 'detail-v' }, v, note ? h('span', { class: 'detail-note' }, note) : null));
  return h('div', { class: 'details' },
    row(current ? 'Club' : 'Last club', clubText),
    row(current ? 'Squad' : 'Last squad', squadText || 'n/a'),
    row('Foot', footText(p)),
    row('Height', Number.isInteger(p.height_cm) ? `${p.height_cm} cm` : DASH),
    row('Nationality', nat.text, nat.note),
    row('Personality', personalityText(p).text, personalityText(p).note),
  );
}

function legend() {
  return h('div', { class: 'band-legend', 'aria-label': 'Attribute colour scale' },
    BAND_LEGEND.map((b) => h('span', { class: `band-chip ${b.band}` }, b.range)));
}

/**
 * @param highlightKeys  future: role key attributes (orange outline, separate
 *                       from the value colours). Empty for now.
 */
function attributeGroup(group, p, open, highlightKeys = new Set()) {
  const rows = group.attrs.map((a) => {
    const v = intOrNull(p.attributes?.[a.key]);
    const band = attrBand(v);
    return h('li', { class: `attr${highlightKeys.has(a.key) ? ' key-attr' : ''}` },
      h('span', { class: 'attr-name' }, a.label),
      h('span', { class: `attr-val ${band || 'none'}` }, orDash(v)));
  });
  return h('details', { class: 'group', open },
    h('summary', {}, h('span', {}, group.label), h('span', { class: 'group-count' }, group.attrs.length)),
    h('ul', { class: 'attr-list' }, rows));
}

function attributesSection(p) {
  const isGK = (p.natural_positions || []).some((c) => String(c).toUpperCase() === 'GK');
  // Goalkeepers: goalkeeping first and open, outfield technical folded away.
  const order = isGK ? ['goalkeeping', 'mental', 'physical', 'technical'] : ['technical', 'mental', 'physical', 'goalkeeping'];
  const groups = order.map((k) => ATTRIBUTE_GROUPS.find((g) => g.key === k));
  return h('section', { class: 'psection' },
    h('div', { class: 'psection-head' }, h('h3', {}, 'Attributes'), legend()),
    groups.map((g) => attributeGroup(g, p, isGK ? g.key !== 'technical' : g.key !== 'goalkeeping')),
  );
}

function traitsSection(p) {
  const { known, unknownCodes } = describeTraits(p);
  return h('section', { class: 'psection' },
    h('h3', {}, 'Player traits'),
    known.length
      ? h('ul', { class: 'traits' }, known.map((t) => h('li', {}, t)))
      : (!unknownCodes.length ? h('p', { class: 'muted small' }, 'No traits recorded.') : null),
    unknownCodes.length
      ? h('p', { class: 'muted small' }, `+${unknownCodes.length} trait${unknownCodes.length === 1 ? '' : 's'} the extractor can’t name yet (game code${unknownCodes.length === 1 ? '' : 's'} ${unknownCodes.join(', ')}).`)
      : null,
  );
}

// Pitch layout, attack at the top; left side on the left.
const PITCH = [
  [null, 'stc', null],
  ['aml', 'amc', 'amr'],
  ['ml', 'mc', 'mr'],
  ['wbl', 'dm', 'wbr'],
  ['dl', 'dc', 'dr'],
  [null, 'sw', null],
  [null, 'gk', null],
];

function familiaritySection(p) {
  const fam = p.positions && typeof p.positions === 'object' ? p.positions : {};
  const natural = new Set((p.natural_positions || []).map((c) => String(c).toLowerCase()));
  const accomplished = new Set((p.accomplished_positions || []).map((c) => String(c).toLowerCase()));
  const tile = (code) => {
    if (!code) return h('span', { class: 'ptile ptile-blank' });
    const v = intOrNull(fam[code]);
    const cls = natural.has(code) ? 'natural' : accomplished.has(code) ? 'accomplished' : '';
    // Neutral shading by value: deliberately not the attribute colour scale.
    const style = v !== null && !cls ? `--fam:${(0.12 + (v / 20) * 0.5).toFixed(2)}` : null;
    return h('span', { class: `ptile ${cls}`, style, title: `${formatPositions([code])}: ${v ?? '—'}` },
      h('span', { class: 'ptile-code' }, formatPositions([code])),
      h('span', { class: 'ptile-val' }, orDash(v)));
  };
  return h('section', { class: 'psection' },
    h('h3', {}, 'Position familiarity'),
    h('div', { class: 'pitch' }, PITCH.map((row) => h('div', { class: 'pitch-row' }, row.map(tile)))),
    h('p', { class: 'fam-legend' },
      h('span', { class: 'ptile-key natural' }), 'Natural',
      h('span', { class: 'ptile-key accomplished' }), 'Accomplished',
    ),
  );
}

function hiddenSection(p) {
  const list = (defs, source) => h('ul', { class: 'attr-list neutral' },
    defs.map((a) => h('li', { class: 'attr' },
      h('span', { class: 'attr-name' }, a.label),
      h('span', { class: 'attr-val none' }, orDash(intOrNull(source?.[a.key]))))));
  return h('details', { class: 'group hidden-group', open: true },
    h('summary', {}, h('span', {}, 'Hidden attributes & personality'), h('span', { class: 'group-count' }, HIDDEN_ATTRS.length + PERSONALITY_ATTRS.length)),
    h('p', { class: 'sub-head' }, 'Hidden attributes'),
    list(HIDDEN_ATTRS, p.attributes),
    h('p', { class: 'sub-head' }, 'Personality values'),
    list(PERSONALITY_ATTRS, p.personality),
  );
}

// ---- View -----------------------------------------------------------------------------

export async function PlayerView({ pid, query }) {
  const back = backTarget(query, '#/');
  const res = await getPlayerProfile(pid);
  if (!res || !res.player) {
    return {
      title: 'Player', back,
      body: h('div', { class: 'empty' },
        h('p', { class: 'empty-title' }, 'Player not found'),
        h('p', { class: 'empty-text' }, 'This player is not in any stored snapshot of this career.')),
    };
  }
  const { player: p, model, current, latestDate } = res;
  const here = `/player/${encodeURIComponent(persistentId(p))}`;
  const devHref = linkWithFrom(`${here}/development`, `${here}?${query.toString()}`);

  return {
    title: displayName(p).main,
    subtitle: current ? formatGameDate(model.gameDate) : `Last recorded ${formatGameDate(model.gameDate)}`,
    back,
    body: h('div', { class: 'stack profile' },
      current ? null : h('div', { class: 'history-banner', role: 'note' },
        icon('restore', 'history-icon'),
        h('p', {}, h('strong', {}, `Not in the latest snapshot (${formatGameDate(latestDate)}).`),
          ` Showing their last recorded data, from ${formatGameDate(model.gameDate)}.`)),
      header(p, model),
      h('a', { class: 'btn btn-primary btn-block dev-btn', href: devHref }, icon('chart'), 'Development'),
      details(p, model, current),
      attributesSection(p),
      traitsSection(p),
      familiaritySection(p),
      hiddenSection(p),
    ),
  };
}
