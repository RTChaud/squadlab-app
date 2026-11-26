// AI Analysis on the player page: the structured request for one player's
// report, built from the snapshot the page shows.
//
// The report type follows club membership in the current snapshot: a player at
// the manager's club gets a Development Report ("where is he best, what should
// he develop next?"), anyone else a Recruitment Report ("is he worth signing,
// whose place would he take, how much should I spend?"). Shortlists don't
// change that.
//
// Everything comes from data SquadLab already holds: the player record, the
// role catalogue and SquadLab role scores (1–20, the mean of the role's key
// attributes for that position and phase; phases never combined), First / Backup / Future XI, the
// role pair saved for each formation slot on the Lineups page (the career's
// tactical setup), and his development history. A phase without a saved role
// is never presented as one.
// Nothing is estimated: missing values are null and a missing fee stays missing.
// Pure: no DOM, no store; the caller passes the context in.

import { PHASES, rolesFor, roleScore, familiarityAt, resolveSavedRole } from './roles.js';
import { SLOTS, SLOT_BY_ID, DEFAULT_LINEUPS } from './lineups.js';
import { ATTR_BY_KEY, HIDDEN_ATTRS, PERSONALITY_ATTRS, intOrNull } from './attributes.js';
import { ATTRIBUTE_INFO } from './attributeInfo.js';
import { profileNameOf, isClubOwned, findInSnapshot, persistentId } from './players.js';
import { isNaturalGoalkeeper } from './radar.js';
import { playerBlock, managerClub, roleFit, comparisonId } from './comparisonRequest.js';

export const PLAYER_SCHEMA = 'squadlab.player.v1';

const FAMILIAR = 15;          // familiarity from which a position counts as one he can play now
const RETRAIN_MARGIN = 0;     // an unfamiliar position is worth a mention when his best role there (in some phase) scores at least as well
const MAX_FAMILIAR = 3;
const MAX_RETRAIN = 1;
const TOP_ROLES = 3;

const round2 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const paOf = (p) => { const v = intOrNull(p?.ability?.potential); return v !== null && v > 0 ? v : null; };
const caOf = (p) => { const v = intOrNull(p?.ability?.current); return v !== null && v >= 0 ? v : null; };

/** Development for club players, recruitment for everyone else. */
export function playerReportType(p, current, data) {
  return current && isClubOwned(p, data) ? 'development' : 'recruitment';
}

/** Roles at a position for one phase, best first for this player. */
function rankedRoles(cat, p, code, phase) {
  return rolesFor(cat, code, phase)
    .map((role) => ({ role, score: roleScore(role, p).value }))
    .filter((x) => x.score !== null)
    .sort((a, b) => b.score - a.score);
}

/** Per position: familiarity and the best roles in each phase (each phase ranked on its own). */
function positionProfile(cat, p, pos) {
  const best = {};
  for (const ph of PHASES) best[ph.id] = rankedRoles(cat, p, pos.code, ph.id);
  const top = Object.fromEntries(PHASES.map((ph) => [ph.id, best[ph.id][0]?.score ?? null]));
  return { pos, familiarity: familiarityAt(p, pos.code), best, top, scored: PHASES.some((ph) => top[ph.id] !== null) };
}

/**
 * Orders positions by his best In Possession role score, then his best Out of
 * Possession one (the phases are compared in turn, never added together).
 */
const phaseOrder = (a, b) => {
  for (const ph of PHASES) {
    const d = (b[ph.id] ?? -1) - (a[ph.id] ?? -1);
    if (d) return d;
  }
  return 0;
};

/** The positions worth discussing: his best familiar ones, his lineup positions, and close unfamiliar ones. */
function candidatePositions(cat, p, extraCodes) {
  const gk = isNaturalGoalkeeper(p);
  const all = cat.positions.filter((pos) => (gk ? pos.code === 'gk' : pos.code !== 'gk')).map((pos) => positionProfile(cat, p, pos)).filter((x) => x.scored);
  const byStrength = (a, b) => phaseOrder(a.top, b.top) || (b.familiarity || 0) - (a.familiarity || 0);
  const familiar = all.filter((x) => (x.familiarity || 0) >= FAMILIAR).sort(byStrength);
  const picked = familiar.slice(0, MAX_FAMILIAR);
  const bestFamiliar = familiar[0] || null;
  // An unfamiliar position is worth a mention when, in some phase, his best role there scores at least as well.
  const closeTo = (x) => !bestFamiliar || PHASES.some((ph) => x.top[ph.id] !== null && x.top[ph.id] >= (bestFamiliar.top[ph.id] ?? -1) - RETRAIN_MARGIN);
  const retrain = all.filter((x) => (x.familiarity || 0) < FAMILIAR && closeTo(x)).sort(byStrength).slice(0, MAX_RETRAIN);
  const out = [...picked];
  for (const code of extraCodes) { const x = all.find((y) => y.pos.code === code); if (x && !out.includes(x)) out.push(x); }
  for (const x of retrain) if (!out.includes(x)) out.push(x);
  return out;
}

/** Attributes that are key for any role at the position, with his values (lowest first). */
function positionAttributes(cat, p, code) {
  const seen = new Map();
  for (const ph of PHASES) for (const role of rolesFor(cat, code, ph.id)) {
    for (const a of role.attrs) {
      if (!a.mapped || seen.has(a.label)) continue;
      const v = intOrNull(p?.[a.block]?.[a.key]);
      if (v !== null) seen.set(a.label, v);
    }
  }
  return Object.fromEntries([...seen.entries()].sort((a, b) => a[1] - b[1]));
}

/** A role with this player's SquadLab score and its inputs. */
const roleEntry = (cat, p, role, code) => ({ name: role.name, ...roleFit(p, role, code) });

function positionBlock(cat, p, x) {
  const roles = {};
  for (const ph of PHASES) {
    roles[ph.id] = x.best[ph.id].slice(0, TOP_ROLES).map(({ role }) => roleEntry(cat, p, role, x.pos.code));
  }
  return {
    position: x.pos.short,
    name: x.pos.label,
    familiarity: x.familiarity,
    needs_retraining: (x.familiarity || 0) < FAMILIAR,
    best_roles: roles,
    position_attributes: positionAttributes(cat, p, x.pos.code),
  };
}

export const SAVED_SOURCE = 'saved for this slot';
export const GENERAL_SOURCE = 'not set for this slot; his best role here, for general positional fit only';

/**
 * The roles to assess in a formation slot: the pair saved for that slot on the
 * Lineups page (shared by First, Backup and Future XI). A phase that isn't set
 * uses the given player's best role at the position, labelled as general
 * positional fit, never as a saved role.
 */
function slotAssessed(cat, slotRoles, slotId, refPlayer) {
  const code = SLOT_BY_ID[slotId].fam;
  const saved = slotRoles?.[slotId] || {};
  const out = {};
  for (const ph of PHASES) {
    const role = saved[ph.id] ? resolveSavedRole(cat, code, ph.id, saved[ph.id]).role : null;
    if (role) { out[ph.id] = { role, source: SAVED_SOURCE }; continue; }
    const top = refPlayer ? rankedRoles(cat, refPlayer, code, ph.id)[0] : null;
    out[ph.id] = top ? { role: top.role, source: GENERAL_SOURCE } : null;
  }
  return out;
}

/** The saved role pair for a slot, by phase: { name, ... } or null when not set. */
function savedPair(cat, slotRoles, slotId) {
  const code = SLOT_BY_ID[slotId].fam;
  return Object.fromEntries(PHASES.map((ph) => {
    const id = slotRoles?.[slotId]?.[ph.id];
    // Migrated ids map; one that can't be mapped counts as not set (it's cleared on the Lineups page).
    const role = id ? resolveSavedRole(cat, code, ph.id, id).role : null;
    return [ph.id, role || null];
  }));
}

const fitFor = (p, assessed, code) => Object.fromEntries(PHASES.filter((ph) => assessed[ph.id]).map((ph) => [ph.id, {
  role: assessed[ph.id].role.name, role_source: assessed[ph.id].source,
  ...roleFit(p, assessed[ph.id].role, code),
}]));

// Attributes whose meaning is most often confused, always defined for the model.
const CORE_DEFINITIONS = ['positioning', 'off_the_ball', 'work_rate', 'acceleration', 'pace', 'anticipation', 'decisions', 'teamwork', 'stamina'];

/** SquadLab's attribute definitions (attributeInfo.js) for the attributes in play, by label. */
function attributeDefinitions(cat, codes) {
  const keys = new Set(CORE_DEFINITIONS);
  for (const code of codes) for (const ph of PHASES) for (const role of rolesFor(cat, code, ph.id)) for (const a of role.attrs) if (a.mapped) keys.add(a.key);
  const out = {};
  for (const k of keys) { const label = ATTR_BY_KEY[k]?.label; if (label && ATTRIBUTE_INFO[k]) out[label] = ATTRIBUTE_INFO[k]; }
  return out;
}

/** Who holds each formation slot at the positions in play (First / Backup / Future XI), for slot suggestions. */
function formationSlots(cat, codes, lineups, data, selfKey, slotRoles) {
  const out = [];
  for (const code of codes) {
    const slots = SLOTS.filter((s) => s.fam === code);
    if (!slots.length) continue;
    const pos = cat.positions.find((y) => y.code === code);
    out.push({
      position: pos?.short || code,
      slots: slots.map((s) => {
        const saved = savedPair(cat, slotRoles, s.id);
        const row = { slot: s.id, roles: Object.fromEntries(PHASES.map((ph) => [ph.id, saved[ph.id]?.name || null])) };
        for (const d of DEFAULT_LINEUPS) {
          const key = lineups.find((l) => l.id === d.id)?.slots[s.id] || null;
          const occ = key ? findInSnapshot(data, key) : null;
          row[d.name] = !key ? null : key === selfKey ? 'him' : occ ? profileNameOf(occ).main : 'a player not in this snapshot';
        }
        return row;
      }),
    });
  }
  return out;
}

/** Every First / Backup / Future XI place of a player key. */
function placesOf(lineups, key) {
  const out = [];
  for (const d of DEFAULT_LINEUPS) {
    const l = lineups.find((x) => x.id === d.id);
    if (!l) continue;
    for (const s of SLOTS) if (l.slots[s.id] === key) out.push({ lineup: l.name, lineupId: l.id, slot: s.id, code: s.fam });
  }
  return out;
}

/** Changes since his earliest earlier snapshot (attributes, CA), from the history SquadLab keeps. */
function developmentHistory(history, gameDate) {
  const seen = (history || []).filter((x) => x.present && x.gameDate <= gameDate);
  if (seen.length < 2) return null;
  const first = seen[0], last = seen[seen.length - 1];
  const changed = {};
  for (const [key, to] of Object.entries(last.attrs || {})) {
    const from = first.attrs?.[key];
    if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) continue;
    const label = ATTR_BY_KEY[key]?.label || HIDDEN_ATTRS.find((a) => a.key === key)?.label || PERSONALITY_ATTRS.find((a) => a.key === key)?.label;
    if (label) changed[label] = { from, to, change: to - from };
  }
  return {
    from_date: first.gameDate, to_date: last.gameDate, snapshots: seen.length,
    ca: { from: first.ca ?? null, to: last.ca ?? null },
    changed_attributes: changed,
  };
}

function personBrief(p, code, assessed, places, cat) {
  return {
    name: profileNameOf(p).main,
    age: intOrNull(p.age), ca: caOf(p), pa: paOf(p),
    familiarity: familiarityAt(p, code),
    lineup_places: places.map((x) => `${x.lineup} ${x.slot}`),
    role_fit: fitFor(p, assessed, code),
  };
}

/** Club players already at this position, best on these roles first (possible depth or internal successors). */
function internalOptions(cat, data, code, assessed, exclude, n) {
  return (data.players || [])
    .filter((p) => isClubOwned(p, data) && !exclude.has(persistentId(p)) && (familiarityAt(p, code) || 0) >= 12)
    .map((p) => {
      const fit = fitFor(p, assessed, code);
      return { p, top: Object.fromEntries(PHASES.map((ph) => [ph.id, fit[ph.id]?.role_score_1_to_20 ?? null])) };
    })
    // Phases compared in turn (In Possession first), never added together.
    .sort((a, b) => phaseOrder(a.top, b.top) || (paOf(b.p) || 0) - (paOf(a.p) || 0))
    .slice(0, n)
    .map((x) => x.p);
}

/**
 * Recruitment: every formation slot at the target's main positions, each
 * judged on the role pair saved for that slot (so RDM and LDM can differ),
 * with the starter, backup and future option in that slot and the strongest
 * other club players there, all scored on the same roles.
 */
function squadFit(cat, target, positions, ctx) {
  const data = ctx.model.raw;
  const lineups = ctx.lineups || [];
  const out = [];
  for (const x of positions) {
    const code = x.pos.code;
    for (const s of SLOTS.filter((sl) => sl.fam === code)) {
      const assessed = slotAssessed(cat, ctx.slotRoles, s.id, target);
      const saved = savedPair(cat, ctx.slotRoles, s.id);
      const seen = new Set([persistentId(target)]);
      const players = [];
      const holders = {};
      for (const d of DEFAULT_LINEUPS) {
        const key = lineups.find((y) => y.id === d.id)?.slots[s.id] || null;
        const p = key ? findInSnapshot(data, key) : null;
        holders[d.name] = !key ? null : p ? profileNameOf(p).main : 'a player not in this snapshot';
        if (!p || seen.has(persistentId(p))) continue;
        seen.add(persistentId(p));
        players.push({ ...personBrief(p, code, assessed, placesOf(lineups, key), cat), at_club: isClubOwned(p, data) });
      }
      for (const p of internalOptions(cat, data, code, assessed, seen, 2)) {
        seen.add(persistentId(p));
        players.push({ ...personBrief(p, code, assessed, placesOf(lineups, ctx.playerKeyOf(p)), cat), at_club: true });
      }
      out.push({
        slot: s.id,
        position: x.pos.short, name: x.pos.label,
        his_familiarity: x.familiarity,
        saved_roles: Object.fromEntries(PHASES.map((ph) => [ph.id, saved[ph.id] ? { name: saved[ph.id].name, key_attributes: saved[ph.id].attrs.map((a) => a.label) } : null])),
        his_role_fit: fitFor(target, assessed, code),
        holders,
        club_players: players,
      });
    }
  }
  return out;
}

/** Development: his First / Backup / Future XI places with the slot's saved roles and his scores on them. */
function assignmentBlocks(cat, p, places, slotRoles) {
  const topTier = places.length ? Math.min(...places.map((x) => DEFAULT_LINEUPS.findIndex((d) => d.id === x.lineupId))) : -1;
  return places.map((x) => {
    const pos = cat.positions.find((y) => y.code === x.code);
    const saved = savedPair(cat, slotRoles, x.slot);
    const assessed = Object.fromEntries(PHASES.map((ph) => [ph.id, saved[ph.id] ? { role: saved[ph.id], source: SAVED_SOURCE } : null]));
    const unset = PHASES.filter((ph) => !saved[ph.id]).map((ph) => ph.id);
    const block = {
      lineup: x.lineup, slot: x.slot, position: pos?.short || x.code,
      primary: DEFAULT_LINEUPS.findIndex((d) => d.id === x.lineupId) === topTier,
      familiarity: familiarityAt(p, x.code),
      role_fit: fitFor(p, assessed, x.code),
      unset_phases: unset,
    };
    if (unset.length) {
      // Roles he could be given there; anything chosen from these is a suggestion, not a saved role.
      block.candidate_roles = Object.fromEntries(unset.map((ph) => [ph, rankedRoles(cat, p, x.code, ph).slice(0, TOP_ROLES).map(({ role }) => roleEntry(cat, p, role, x.code))]));
    }
    return block;
  });
}

/**
 * @param {object} res  { player, model, current } — the snapshot the page shows
 * @param {object} ctx  { cat, lineups, slotRoles, history, playerKeyOf(p), teamLabelOf(squad, model) }
 * @returns {{ payload, signature, id, type, name }}
 */
export function buildPlayerRequest(res, ctx) {
  const { player: p, model, current } = res;
  const cat = ctx.cat;
  const type = playerReportType(p, current, model.raw);
  const club = managerClub(model);
  const key = ctx.playerKeyOf(p);
  const places = key ? placesOf(ctx.lineups || [], key) : [];
  const base = playerBlock(res, 'P', ctx, { position: null, roles: { in_possession: null, out_of_possession: null } }, club);
  delete base.label;
  const positions = candidatePositions(cat, p, type === 'development' ? places.map((x) => x.code) : []);

  const payload = {
    schema: PLAYER_SCHEMA,
    report_id: null,
    report_type: type,
    game_date: model.gameDate,
    manager_club: club.name,
    player: base,
    positions: positions.map((x) => positionBlock(cat, p, x)),
  };
  if (type === 'development') {
    payload.lineup_assignments = assignmentBlocks(cat, p, places, ctx.slotRoles);
    payload.formation_slots = formationSlots(cat, positions.map((x) => x.pos.code), ctx.lineups || [], model.raw, key, ctx.slotRoles);
    payload.development_history = developmentHistory(ctx.history, model.gameDate);
  } else {
    // His best positions that the lineups use (4-2-3-1), plus one he'd need retraining for.
    const inFormation = positions.filter((x) => SLOTS.some((sl) => sl.fam === x.pos.code));
    const fitPositions = inFormation.filter((x) => (x.familiarity || 0) >= FAMILIAR).slice(0, 2)
      .concat(inFormation.filter((x) => (x.familiarity || 0) < FAMILIAR).slice(0, 1));
    payload.squad_fit = squadFit(cat, p, fitPositions, { ...ctx, model });
  }
  payload.attribute_definitions = attributeDefinitions(cat, positions.map((x) => x.pos.code));
  const signature = `player:${JSON.stringify({ ...payload, report_id: null })}`;
  const id = comparisonId(signature).replace(/^cmp_/, 'ply_');
  payload.report_id = id;
  return { payload, signature, id, type, name: base.name };
}
