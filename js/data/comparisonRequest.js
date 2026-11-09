// AI Analysis request assembly: turns what Comparison is showing (two players,
// their snapshots, and — in Position / role mode — the position and roles) into
// the structured payload the Worker's /compare endpoint expects.
//
// Everything comes from the same player records Comparison displays. Nothing is
// estimated: a value the snapshot doesn't hold is sent as null, and a missing
// asking price stays missing (never zero, never another field).
// Pure: no DOM, no store; the caller passes the context in.

import { ATTRIBUTE_GROUPS, HIDDEN_ATTRS, PERSONALITY_ATTRS, describeTraits, intOrNull } from './attributes.js';
import { PHASES, positionByCode, rolesFor, roleScore, roleValue, familiarityAt } from './roles.js';
import { askingPrice, monthlySalary, contractEnd, timeRemaining, clausesOf, clauseStatus, CLAUSE_TYPES } from './contract.js';
import { formatMoneyDisplay } from './money.js';
import { profileNameOf, isClubOwned, findInSnapshot, persistentId } from './players.js';
import { formatPositions, PITCH_CODES } from './positions.js';
import { SLOTS } from './lineups.js';

export const REQUEST_SCHEMA = 'squadlab.compare.v1';
export const LABELS = ['A', 'B'];

const round2 = (v) => Math.round(v * 100) / 100;
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const paOf = (p) => { const v = intOrNull(p?.ability?.potential); return v !== null && v > 0 ? v : null; };
const caOf = (p) => { const v = intOrNull(p?.ability?.current); return v !== null && v >= 0 ? v : null; };

function money(amount) {
  return typeof amount === 'number' && Number.isFinite(amount) ? { amount: round2(amount), display: formatMoneyDisplay(amount) } : null;
}

function foot(p) {
  const l = intOrNull(p.left_foot), r = intOrNull(p.right_foot);
  if (l === null || r === null) return null;
  return { preferred: l === r ? 'Both' : r > l ? 'Right' : 'Left', left: l, right: r };
}

function attributeBlocks(p) {
  const out = {};
  for (const g of ATTRIBUTE_GROUPS) {
    const vals = {};
    for (const a of g.attrs) { const v = intOrNull(p.attributes?.[a.key]); if (v !== null) vals[a.label] = v; }
    if (Object.keys(vals).length) out[g.label] = vals;
  }
  return out;
}

function hidden(p) {
  const pick = (defs, block) => Object.fromEntries(defs.map((a) => [a.label, intOrNull(p[block]?.[a.key])]).filter(([, v]) => v !== null));
  return { hidden_attributes: pick(HIDDEN_ATTRS, 'attributes'), personality: pick(PERSONALITY_ATTRS, 'personality') };
}

function familiarity(p) {
  const out = {};
  for (const code of PITCH_CODES) { const v = familiarityAt(p, code); if (v !== null) out[formatPositions([code.toUpperCase()])] = v; }
  return out;
}

/** The club the manager runs, its nation (from one of its own players), for clause applicability. */
function managerClub(model) {
  const club = model?.club || {};
  const own = (model?.raw?.players || []).find((p) => p.club_uid === club.uid && Number.isInteger(p.club_nation_id));
  return { name: str(club.name), uid: Number.isInteger(club.uid) ? club.uid : null, nationId: own ? own.club_nation_id : null };
}

const CLAUSE_APPLIES = {
  standard: () => ({ applies_to_manager_club: true, condition: 'Any club' }),
  foreign: (p, club) => ({
    applies_to_manager_club: Number.isInteger(p.club_nation_id) && club.nationId !== null ? p.club_nation_id !== club.nationId : null,
    condition: 'Clubs from another country',
  }),
  champions: () => ({ applies_to_manager_club: null, condition: 'Clubs in the Champions League' }),
  relegation: () => ({ applies_to_manager_club: null, condition: "If the player's club is relegated" }),
};

function releaseClauses(p, club, own) {
  if (own) return [];
  const out = [];
  for (const t of CLAUSE_TYPES) {
    for (const cl of clausesOf(p, t.id)) {
      const entry = { type: t.label, fee: money(cl.value), ...CLAUSE_APPLIES[t.id](p, club) };
      if (t.id === 'relegation') entry.activation_status = clauseStatus(cl); // active | inactive | unknown
      out.push(entry);
    }
  }
  return out;
}

function squadOf(p, model, teamLabelOf) {
  const squad = model.squads.find((s) => s.playerUids.includes(p.uid));
  if (!squad) return null;
  return teamLabelOf?.(squad, model) || squad.name;
}

/** Role evidence for one player in one phase: familiarity is per position, values per role attribute. */
function roleFit(p, role, posCode) {
  const s = roleScore(role, p);
  const val = (tier) => Object.fromEntries(role.attrs.filter((a) => a.tier === tier).map((a) => [a.tendency ? `${a.label} (tendency)` : a.label, roleValue(p, a)]));
  const fit = { squadlab_role_score_out_of_100: s.value === null ? null : round2(s.value), key_attributes: val('key') };
  const sup = val('supporting');
  if (Object.keys(sup).length) fit.supporting_attributes = sup;
  return fit;
}

/**
 * The comparison basis Comparison is displaying: in Position / role mode the
 * selected position and any roles; otherwise none (a general comparison).
 */
export function comparisonBasis(compare, cat) {
  if (compare?.mode !== 'role' || !compare.rolePos || !cat || cat.error) return { position: null, roles: { in_possession: null, out_of_possession: null } };
  const position = positionByCode(cat, compare.rolePos);
  if (!position) return { position: null, roles: { in_possession: null, out_of_possession: null } };
  const roles = {};
  for (const ph of PHASES) {
    const id = compare.roleByPos?.[compare.rolePos]?.[ph.id];
    roles[ph.id] = id ? rolesFor(cat, position.code, ph.id).find((r) => r.id === id) || null : null;
  }
  return { position, roles };
}

/** Stable text for what is being compared; any change means a new comparison. */
export function comparisonSignature(L, R, basis) {
  return JSON.stringify([
    persistentId(L.player), L.model.id, persistentId(R.player), R.model.id,
    basis.position?.code || null, basis.roles.in_possession?.id || null, basis.roles.out_of_possession?.id || null,
  ]);
}

/** Short id for a signature (FNV-1a), echoed back by the Worker. */
export function comparisonId(signature) {
  let h = 0x811c9dc5;
  for (let i = 0; i < signature.length; i++) { h ^= signature.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `cmp_${(h >>> 0).toString(36)}_${signature.length.toString(36)}`;
}

function playerBlock(res, label, ctx, basis, club) {
  const p = res.player;
  const own = isClubOwned(p, res.model.raw);
  const ask = askingPrice(p);
  const end = contractEnd(p);
  const monthly = monthlySalary(p);
  const name = profileNameOf(p);
  const pos = basis.position;
  const block = {
    label,
    name: name.main,
    age: intOrNull(p.age),
    club: str(p.club_name),
    on_loan_from: p.on_loan ? str(p.loan_parent_club_name) : null,
    at_manager_club: own,
    squad: own ? squadOf(p, res.model, ctx.teamLabelOf) : null,
    snapshot_date: res.model.gameDate,
    ca: caOf(p),
    pa: paOf(p),
    natural_positions: formatPositions(Array.isArray(p.natural_positions) ? p.natural_positions : []) || null,
    position_familiarity: familiarity(p),
    preferred_foot: foot(p),
    traits: describeTraits(p).known,
    attributes: attributeBlocks(p),
    ...hidden(p),
    // The fee: the asking price SquadLab shows, or missing. An own player is kept or promoted, not bought.
    recruitment_option: own ? 'keep_or_promote' : 'sign',
    asking_price: own
      ? { status: 'not_applicable', note: 'Already at the manager’s club' }
      : ask.amount === null
        ? { status: 'missing' }
        : { status: 'available', ...money(ask.amount), source: ask.source === 'verified' ? 'asking_price' : 'indicative_from_transfer_value' },
    monthly_salary: money(monthly),
    contract_expiry: end,
    contract_remaining: end ? timeRemaining(res.model.gameDate, end) : null,
    release_clauses: releaseClauses(p, club, own),
  };
  if (pos) {
    block.familiarity_at_position = familiarityAt(p, pos.code);
    const fit = {};
    for (const ph of PHASES) if (basis.roles[ph.id]) fit[ph.id] = roleFit(p, basis.roles[ph.id], pos.code);
    if (Object.keys(fit).length) block.role_fit = fit;
  }
  return block;
}

function roleBlock(role) {
  const list = (tier) => role.attrs.filter((a) => a.tier === tier).map((a) => (a.tendency ? `${a.label} (tendency)` : a.label));
  const out = { name: role.name, key_attributes: list('key') };
  if (role.description) out.description = role.description;
  const sup = list('supporting');
  if (sup.length) out.supporting_attributes = sup;
  return out;
}

/**
 * Current starter and backup at the selected position, from the First XI and
 * Backup XI slots that use that position's familiarity. None when no slot uses
 * it (e.g. a 4-2-3-1 has no centre midfield slot) or the slot is empty.
 */
function benchmarks(basis, ctx, labelsByPid) {
  const pos = basis.position;
  if (!pos || !ctx.lineups || !ctx.model) return [];
  const slots = SLOTS.filter((s) => s.fam === pos.code);
  if (!slots.length) return [];
  const out = [];
  for (const [lineupId, role] of [['first-xi', 'starter'], ['backup-xi', 'backup']]) {
    const lineup = ctx.lineups.find((l) => l.id === lineupId);
    if (!lineup) continue;
    for (const s of slots) {
      const key = lineup.slots[s.id];
      if (!key) continue;
      const p = findInSnapshot(ctx.model.raw, key);
      if (!p) continue;
      const b = {
        benchmark: role, lineup: lineup.name, slot: s.id,
        name: profileNameOf(p).main, age: intOrNull(p.age), ca: caOf(p), pa: paOf(p),
        familiarity_at_position: familiarityAt(p, pos.code),
      };
      const same = labelsByPid.get(persistentId(p));
      if (same) b.is_compared_player = same;
      const fit = {};
      for (const ph of PHASES) if (basis.roles[ph.id]) fit[ph.id] = roleFit(p, basis.roles[ph.id], pos.code);
      if (Object.keys(fit).length) b.role_fit = fit;
      out.push(b);
    }
  }
  return out;
}

/**
 * @param {object} L, R   Comparison's resolved players: { player, model, current }
 * @param {object} ctx    { compare, cat, model (latest), lineups, teamLabelOf(squad, model), budget? }
 * @returns {{ payload, signature, id, basis }}
 */
export function buildComparisonRequest(L, R, ctx) {
  const basis = comparisonBasis(ctx.compare, ctx.cat);
  const signature = comparisonSignature(L, R, basis);
  const id = comparisonId(signature);
  const club = managerClub(ctx.model);
  const labelsByPid = new Map([[persistentId(L.player), 'A'], [persistentId(R.player), 'B']]);
  const pos = basis.position;
  const phases = PHASES.filter((ph) => basis.roles[ph.id]).map((ph) => ph.id);

  const payload = {
    schema: REQUEST_SCHEMA,
    comparison_id: id,
    game_date: ctx.model?.gameDate || L.model.gameDate,
    manager_club: club.name,
    comparison: {
      position: pos ? { code: pos.short, name: pos.label } : null,
      assessed_phases: phases,
      roles: Object.fromEntries(PHASES.map((ph) => [ph.id, basis.roles[ph.id] ? roleBlock(basis.roles[ph.id]) : null])),
      mode: !pos ? 'general' : phases.length ? 'role' : 'position',
    },
    players: [playerBlock(L, 'A', ctx, basis, club), playerBlock(R, 'B', ctx, basis, club)],
  };
  const bm = benchmarks(basis, ctx, labelsByPid);
  if (bm.length) payload.benchmarks = bm;
  if (ctx.budget && typeof ctx.budget.amount === 'number') payload.budget = money(ctx.budget.amount);
  return { payload, signature, id, basis };
}

