// Shared player profile — opened from any squad or shortlist.

import { h, icon, orDash, DASH } from '../dom.js';
import {
  getPlayerProfile, tagsForPlayer, playerKeyOf, squadSlotsFor,
  getChangePrefs, setChangePrefs, earlierObservations, getPlayerAt,
  getPlayerHistory, listLineups, getTactic, getRadarPrefs,
} from '../../store.js';
import { AiAnalysisButton, CopyForChatButton } from '../components/aiAnalysis.js';
import { buildPlayerRequest } from '../../data/playerRequest.js';
import { loadRoleCatalogue } from '../../data/roles.js';
import { openTagSheet } from '../components/tagSheet.js';
import { openAttributeInfo } from '../components/attributeInfoSheet.js';
import { RoleExplorer } from '../components/roleExplorer.js';
import { RadarSection } from '../components/radarSection.js';
import { isNaturalGoalkeeper } from '../../data/radar.js';
import { formatGameDate, resolveTeams } from '../../data/snapshot.js';
import { openContractSheet } from '../components/contractSheet.js';
import { describePositions } from '../../data/positions.js';
import { persistentId, profileNameOf } from '../../data/players.js';
import { resolveNation, loadNations } from '../../data/nations.js';
import {
  ATTRIBUTE_GROUPS, HIDDEN_ATTRS, PERSONALITY_ATTRS,
  attrBand, attributeDirection, describeTraits, intOrNull,
} from '../../data/attributes.js';
import { describeChange, resolveBaseline } from '../../data/changes.js';
import { DEFAULT_LINEUPS } from '../../data/lineups.js';
import { backTarget, linkWithFrom } from '../../router.js';

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

// Shared with the Squad/Shortlists tables: the common name (e.g. "Endrick") when FM has one.
const displayName = (p) => profileNameOf(p);

function footText(p) {
  const l = intOrNull(p.left_foot), r = intOrNull(p.right_foot);
  if (l === null || r === null) return DASH;
  const pref = l === r ? 'Both' : r > l ? 'Right' : 'Left';
  return `${pref} (L ${l} · R ${r})`;
}

/**
 * Nationality value: small flags (main nationality first), tap to show the
 * names. Nations without a flag emoji show their name instead.
 */
function nationalityValue(p, careerId) {
  const ids = [p.nation_id, ...(Array.isArray(p.second_nation_ids) ? p.second_nation_ids : [])].filter(Number.isInteger);
  if (!ids.length) return { value: DASH };
  const nations = ids.map((id) => resolveNation(id, careerId));
  const known = nations.filter(Boolean);
  if (!known.length) return { value: 'Nationality unavailable', note: `FM nation ID${ids.length > 1 ? 's' : ''} ${ids.join(', ')}` };

  const unknown = ids.filter((_, i) => !nations[i]);
  const names = known.map((n) => n.name).join(', ');
  const namesEl = h('span', { class: 'detail-note', hidden: true }, names);
  const btn = h('button', {
    type: 'button', class: 'flags', 'aria-label': names, 'aria-expanded': 'false',
    onclick: () => {
      namesEl.hidden = !namesEl.hidden;
      btn.setAttribute('aria-expanded', String(!namesEl.hidden));
    },
  }, known.map((n) => (n.flag
    ? h('span', { class: 'flag', 'aria-hidden': 'true' }, n.flag)
    : h('span', { class: 'flag-text' }, n.name))));
  return {
    value: btn,
    extra: [namesEl, unknown.length ? h('span', { class: 'detail-note' }, `+ unknown nation ID${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')}`) : null],
  };
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

const caOf = (p) => intOrNull(p?.ability?.current);
const paOf = (p) => {
  const v = intOrNull(p?.ability?.potential);
  return v !== null && v > 0 ? v : null;
};

/**
 * Small change indicator. `what` names the value for screen readers.
 * PA is always neutral: it shows what was recorded, not training progress.
 */
function deltaEl(c, what, cls = 'attr-delta') {
  return h('span', { class: `${cls} d-${c.tone}`, 'aria-label': `${what}: ${c.label}`, title: c.label }, c.text);
}

function header(p, model, chg) {
  const name = displayName(p);
  const pos = describePositions(p);
  const ca = caOf(p);
  const pa = paOf(p);
  const age = intOrNull(p.age);
  const caChg = chg.active ? describeChange(ca, caOf(chg.base), 'positive') : null;
  const paChg = chg.active ? describeChange(pa, paOf(chg.base), 'neutral') : null;

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
      h('div', { class: 'badge' }, h('span', { class: 'badge-label' }, 'CA'), h('span', { class: 'badge-value' }, orDash(ca)),
        caChg ? deltaEl(caChg, 'CA change', 'badge-delta') : null),
      h('div', { class: 'badge badge-pa' }, h('span', { class: 'badge-label' }, 'PA'), h('span', { class: 'badge-value' }, orDash(pa)),
        paChg ? deltaEl({ ...paChg, label: paChg.diff === null ? paChg.label : `recorded PA ${paChg.label}` }, 'Recorded PA change', 'badge-delta') : null),
    ),
  );
}

/**
 * Squad slot: read straight from the three default lineups (custom lineups
 * don't count). Grouped by lineup with a visible word, chips link to the lineup.
 */
function squadSlotValue(p, backHere) {
  const slots = squadSlotsFor(playerKeyOf(p)); // already in lineup priority, then slot order
  if (!slots.length) return h('span', { class: 'slot-none' }, 'Not assigned');
  return h('span', { class: 'slot-groups' }, DEFAULT_LINEUPS.map((l) => {
    const mine = slots.filter((s) => s.tier === l.tier);
    if (!mine.length) return null;
    const word = l.name.replace(/\s*XI$/, '');
    return h('span', { class: `slot-group t${l.tier}` },
      h('span', { class: 'slot-tier', 'aria-hidden': 'true' }, word),
      mine.map((s) => h('a', {
        class: `slot-chip t${l.tier}`,
        href: linkWithFrom(`/lineups/${encodeURIComponent(l.id)}`, backHere),
        'aria-label': `${l.name}: ${s.slot}. Open lineup`,
      }, s.slot)));
  }));
}

function details(p, model, current, backHere) {
  const { clubText, squadText } = clubAndSquad(p, model);
  const nat = nationalityValue(p, model.careerId);
  const row = (k, v, note, extra) => h('div', { class: 'detail' },
    h('span', { class: 'detail-k' }, k),
    h('span', { class: 'detail-v' }, v, note ? h('span', { class: 'detail-note' }, note) : null, extra || null));
  return h('div', { class: 'details' },
    row(current ? 'Club' : 'Last club', clubText),
    row(current ? 'Squad' : 'Last squad', squadText || 'n/a'),
    row('Foot', footText(p)),
    row('Height', Number.isInteger(p.height_cm) ? `${p.height_cm} cm` : DASH),
    row('Nationality', nat.value, nat.note, nat.extra),
    row('Squad slot', squadSlotValue(p, backHere)),
  );
}

/**
 * One attribute row: neutral name, coloured value badge. The small marker
 * before the name is reserved for future role key attributes (orange); it is
 * empty for now.
 */
function attrRow(def, v, chg, baseV, isKey = false) {
  const direction = attributeDirection(def.key);
  const band = attrBand(v, direction);
  const btn = h('button', {
    type: 'button', class: 'attr-name', 'aria-haspopup': 'dialog',
    onclick: () => openAttributeInfo(def, btn),
  }, def.label);
  return h('li', { class: `attr${isKey ? ' key-attr' : ''}` },
    h('span', { class: 'attr-mark', 'aria-hidden': 'true' }),
    btn,
    chg.active ? deltaEl(describeChange(v, baseV, direction), `${def.label} change`) : null,
    h('span', { class: `attr-val ${band || 'none'}` }, orDash(v)));
}

/**
 * @param highlightKeys  future: role key attributes (orange outline, separate
 *                       from the value colours). Empty for now.
 */
function attributeGroup(group, p, chg, open, highlightKeys = new Set()) {
  const rows = group.attrs.map((a) => attrRow(a, intOrNull(p.attributes?.[a.key]), chg,
    intOrNull(chg.base?.attributes?.[a.key]), highlightKeys.has(a.key)));
  return h('details', { class: 'group', open },
    h('summary', {}, h('span', {}, group.label), h('span', { class: 'group-count' }, group.attrs.length)),
    h('ul', { class: 'attr-list' }, rows));
}

/** "Show changes" toggle + baseline picker (per player, remembered). */
function changesControls(chg) {
  const toggle = h('button', {
    type: 'button', class: `chg-toggle${chg.show ? ' on' : ''}`, 'aria-pressed': String(chg.show),
    disabled: !chg.key,
    onclick: () => setChangePrefs(chg.key, { show: !chg.show }),
  }, h('span', { class: 'chg-switch', 'aria-hidden': 'true' }), 'Show changes');

  let bar = null;
  // Only one observation: nothing to compare yet, so no baseline picker.
  if (chg.show && chg.dates.length) {
    const [earliest, ...later] = chg.dates;
    const pinned = chg.pref.baseline && chg.dates.includes(chg.pref.baseline) ? chg.pref.baseline : '';
    const opts = [
      h('option', { value: '', selected: pinned === '' }, `Earliest · ${formatGameDate(earliest)}`),
      ...(pinned === earliest ? [earliest] : []).concat(later).map((d) =>
        h('option', { value: d, selected: pinned === d }, formatGameDate(d))),
    ];
    bar = h('div', { class: 'chg-bar' },
      h('label', { class: 'muted small', for: 'chg-baseline' }, 'Since'),
      h('select', {
        id: 'chg-baseline', class: 'select select-sm chg-select',
        onchange: (e) => setChangePrefs(chg.key, { baseline: e.target.value || null }),
      }, opts),
      h('span', { class: 'muted small chg-to' }, `→ ${formatGameDate(chg.currentDate)}`));
  }
  return { toggle, bar };
}

function attributesSection(p, chg) {
  const isGK = isNaturalGoalkeeper(p);
  // Goalkeepers: goalkeeping first and open, outfield technical folded away.
  const order = isGK ? ['goalkeeping', 'mental', 'physical', 'technical'] : ['technical', 'mental', 'physical', 'goalkeeping'];
  const groups = order.map((k) => ATTRIBUTE_GROUPS.find((g) => g.key === k));
  const { toggle, bar } = changesControls(chg);
  return h('section', { class: `psection${chg.active ? ' show-changes' : ''}` },
    h('div', { class: 'psection-head attr-head' }, h('h3', {}, 'Attributes'), toggle),
    bar,
    groups.map((g) => attributeGroup(g, p, chg, isGK ? g.key !== 'technical' : g.key !== 'goalkeeping')),
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

// Pitch layout, attack at the top; left side on the left. (No sweeper: not in current FM.)
// Tapping a tile explores that position's roles underneath (role explorer).
function familiaritySection(p) {
  const { pitch, panel } = RoleExplorer(p, playerKeyOf(p));
  return h('section', { class: 'psection fam-section' }, h('h3', {}, 'Position familiarity'), pitch, panel);
}

function hiddenSection(p, chg) {
  const list = (defs, block) => h('ul', { class: `attr-list neutral${chg.active ? ' show-changes' : ''}` },
    defs.map((a) => attrRow(a, intOrNull(p[block]?.[a.key]), chg, intOrNull(chg.base?.[block]?.[a.key]))));
  return h('details', { class: 'group hidden-group', open: true },
    h('summary', {}, h('span', {}, 'Hidden attributes & personality'), h('span', { class: 'group-count' }, HIDDEN_ATTRS.length + PERSONALITY_ATTRS.length)),
    h('p', { class: 'sub-head' }, 'Hidden attributes'),
    list(HIDDEN_ATTRS, 'attributes'),
    h('p', { class: 'sub-head' }, 'Personality values'),
    list(PERSONALITY_ATTRS, 'personality'),
  );
}

/** Development | Contract | Tags, side by side. */
function actionRow(p, devHref, model, current) {
  const key = playerKeyOf(p);
  const count = key ? tagsForPlayer(key).length : 0;
  return h('div', { class: 'profile-actions' },
    h('a', { class: 'btn btn-primary dev-btn', href: devHref }, icon('chart'), 'Development'),
    h('button', {
      type: 'button', class: 'btn btn-secondary contract-btn', 'aria-haspopup': 'dialog',
      onclick: () => openContractSheet(p, model.gameDate, { name: displayName(p).main, current }),
    }, icon('contract'), 'Contract'),
    h('button', {
      type: 'button', class: 'btn btn-secondary tags-btn', disabled: !key,
      onclick: () => openTagSheet({ playerKey: key, playerName: displayName(p).main }),
    }, icon('tag'), 'Tags', count ? h('span', { class: 'count-badge' }, String(count)) : null),
  );
}

/**
 * AI Analysis | Copy for ChatGPT, under Development / Contract / Tags. The
 * report type follows club membership (Development Report for the club's
 * players, Recruitment Report otherwise); the request is built at tap time
 * from the shown snapshot, so lineup or role changes are always included.
 */
function aiRow(p, model, current, cat, history) {
  const getRequest = () => {
    if (!cat || cat.error || !cat.positions?.length) return null;
    const key = playerKeyOf(p);
    const req = buildPlayerRequest({ player: p, model, current }, {
      cat, history,
      lineups: listLineups(), tactic: getTactic(),
      rolePrefs: key ? getRadarPrefs(key) : null,
      playerKeyOf,
      teamLabelOf: (squad, m) => resolveTeams(m).find((t) => t.squad && t.squad.id === squad.id)?.label || null,
    });
    return {
      kind: 'player', payload: req.payload, signature: req.signature,
      basisText: `${req.name} · ${req.type === 'development' ? 'Development Report' : 'Recruitment Report'}`,
    };
  };
  return h('div', { class: 'ai-actions profile-ai' }, AiAnalysisButton({ getRequest }), CopyForChatButton({ getRequest }));
}

// ---- View -----------------------------------------------------------------------------

export async function PlayerView({ pid, query }) {
  const back = backTarget(query, '#/');
  const [res, cat, history] = await Promise.all([getPlayerProfile(pid), loadRoleCatalogue(), getPlayerHistory(pid), loadNations()]);
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
  const backHere = `${here}?${query.toString()}`;
  const devHref = linkWithFrom(`${here}/development`, backHere);

  // Changes: compare the displayed snapshot with an earlier observation of
  // this player (default: their earliest, which follows later older imports).
  const key = playerKeyOf(p);
  const pref = key ? getChangePrefs(key) : { show: false, baseline: null };
  const chg = { key, pref, show: pref.show, dates: [], base: null, active: false, currentDate: model.gameDate };
  if (chg.show) {
    chg.dates = await earlierObservations(pid, model.gameDate);
    const baseDate = resolveBaseline(chg.dates, pref.baseline);
    chg.base = baseDate ? await getPlayerAt(pid, baseDate) : null;
    chg.active = !!chg.base;
  }
  const headEl = header(p, model, chg);

  return {
    title: displayName(p).main,
    subtitle: current ? formatGameDate(model.gameDate) : `Last recorded ${formatGameDate(model.gameDate)}`,
    // Compact header: the name appears there only once the card's name has scrolled away.
    revealTitle: headEl.querySelector('.profile-name'),
    back,
    body: h('div', { class: 'stack profile' },
      current ? null : h('div', { class: 'history-banner', role: 'note' },
        icon('restore', 'history-icon'),
        h('p', {}, h('strong', {}, `Not in the latest snapshot (${formatGameDate(latestDate)}).`),
          ` Showing their last recorded data, from ${formatGameDate(model.gameDate)}.`)),
      headEl,
      actionRow(p, devHref, model, current),
      aiRow(p, model, current, cat, history),
      details(p, model, current, backHere),
      familiaritySection(p),
      RadarSection(p, playerKeyOf(p)),
      attributesSection(p, chg),
      traitsSection(p),
      hiddenSection(p, chg),
    ),
  };
}
