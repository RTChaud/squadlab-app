// Copy for ChatGPT: one self-contained, human-readable prompt built from the same
// comparison payload SquadLab sends to the Worker (buildComparisonRequest), plus
// the SquadLab report for exactly that comparison when there is one.
// Pure and local: no network, no store.

import { formatGameDate } from './snapshot.js';
import { shortNames, verdictKind, plainReportText } from './aiClient.js';

const PHASE_LABEL = { in_possession: 'In Possession', out_of_possession: 'Out of Possession' };
const VERDICT_LABEL = { recruitment: 'Recruitment Verdict', mixed: 'Recruitment Verdict', squad: 'Squad Verdict' };

const unknown = (v) => (v === null || v === undefined || v === '' ? 'unknown' : v);
const score = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 100) / 100) : 'unknown');
const list = (obj) => Object.entries(obj || {}).map(([k, v]) => `${k} ${unknown(v)}`).join(', ');
const dateText = (iso) => (iso ? formatGameDate(iso) || iso : 'unknown');

function statusOf(p, club) {
  if (p.at_manager_club) return `at ${club || 'my club'}${p.squad ? ` (${p.squad})` : ''}`;
  const loan = p.on_loan_from ? `, on loan from ${p.on_loan_from}` : '';
  return `external target${p.club ? ` (${p.club}${loan})` : loan ? ` (${loan.slice(2)})` : ''}`;
}

function askingText(p) {
  const a = p.asking_price || {};
  if (a.status === 'not_applicable') return 'not applicable (already at my club)';
  if (a.status !== 'available') return 'unknown';
  return a.source === 'indicative_from_transfer_value' ? `${a.display} (indicative, from the exported transfer value)` : a.display;
}

function clauseText(c) {
  const applies = c.applies_to_manager_club === true ? 'applies to my club'
    : c.applies_to_manager_club === false ? 'does not apply to my club' : 'unknown whether it applies to my club';
  const status = c.activation_status ? `; ${c.activation_status === 'active' ? 'active' : c.activation_status === 'inactive' ? 'not active' : 'activation unknown'}` : '';
  return `${c.type}: ${c.fee?.display || 'unknown'} (${c.condition}; ${applies}${status})`;
}

function playerSection(p, c, club) {
  const out = [`PLAYER: ${p.name}`];
  out.push(`Status: ${statusOf(p, club)}`);
  out.push(`Age: ${unknown(p.age)} · CA ${unknown(p.ca)} · PA ${unknown(p.pa)}`);
  out.push(`Natural positions: ${unknown(p.natural_positions)}`);
  if (c.position) out.push(`Familiarity at ${c.position.code}: ${unknown(p.familiarity_at_position)}`);
  if (Object.keys(p.position_familiarity || {}).length) out.push(`Positional familiarity: ${list(p.position_familiarity)}`);
  const f = p.preferred_foot;
  out.push(`Preferred foot: ${f ? `${f.preferred} (left ${f.left}, right ${f.right})` : 'unknown'}`);
  out.push(`Traits: ${p.traits?.length ? p.traits.join('; ') : 'none known'}`);
  for (const [group, vals] of Object.entries(p.attributes || {})) out.push(`${group}: ${list(vals)}`);
  if (Object.keys(p.hidden_attributes || {}).length) out.push(`Hidden attributes: ${list(p.hidden_attributes)}`);
  if (Object.keys(p.personality || {}).length) out.push(`Personality: ${list(p.personality)}`);
  out.push(`Asking price (assumed transfer fee): ${askingText(p)}`);
  out.push(`Monthly salary: ${p.monthly_salary?.display || 'unknown'}`);
  out.push(`Contract expiry: ${dateText(p.contract_expiry)}${p.contract_remaining ? ` (${p.contract_remaining})` : ''}`);
  if (!p.at_manager_club) out.push(`Release clauses: ${p.release_clauses?.length ? p.release_clauses.map(clauseText).join('; ') : 'none known'}`);
  return out.join('\n');
}

function rolesSection(payload, names) {
  const c = payload.comparison;
  const [A, B] = payload.players;
  if (c.mode === 'general' || !c.position) return 'ROLES\nNo position or role selected. Give a general comparison and say which positions or strengths it rests on.';
  const out = ['ROLES', `Position: ${c.position.name} (${c.position.code})`];
  if (!c.assessed_phases.length) {
    out.push('No role selected. Give a general comparison of the two players at this position.');
    return out.join('\n');
  }
  for (const ph of c.assessed_phases) {
    const role = c.roles[ph];
    const fa = A.role_fit?.[ph] || {}, fb = B.role_fit?.[ph] || {};
    out.push('');
    out.push(`${PHASE_LABEL[ph]}: ${role.name}${role.description ? ` (${role.description})` : ''}`);
    out.push(`Key attributes: ${role.key_attributes.join(', ')}`);
    if (role.supporting_attributes?.length) out.push(`Supporting attributes: ${role.supporting_attributes.join(', ')}`);
    out.push(`SquadLab role score (out of 100): ${names.A} ${score(fa.squadlab_role_score_out_of_100)}, ${names.B} ${score(fb.squadlab_role_score_out_of_100)}`);
    const keys = Object.keys(fa.key_attributes || fb.key_attributes || {});
    if (keys.length) out.push(`Key attribute values: ${keys.map((k) => `${k} ${names.A} ${unknown(fa.key_attributes?.[k])} / ${names.B} ${unknown(fb.key_attributes?.[k])}`).join('; ')}`);
    const sup = Object.keys(fa.supporting_attributes || {});
    if (sup.length) out.push(`Supporting attribute values: ${sup.map((k) => `${k} ${names.A} ${unknown(fa.supporting_attributes?.[k])} / ${names.B} ${unknown(fb.supporting_attributes?.[k])}`).join('; ')}`);
  }
  return out.join('\n');
}

function benchmarkSection(payload) {
  const c = payload.comparison;
  if (!payload.benchmarks?.length) return null;
  const out = [`CURRENT ${c.position ? c.position.code : ''} OPTIONS IN MY LINEUPS`.replace(/\s+/g, ' ')];
  for (const b of payload.benchmarks) {
    const scores = c.assessed_phases.map((ph) => `${PHASE_LABEL[ph]} score ${score(b.role_fit?.[ph]?.squadlab_role_score_out_of_100)}`).join(', ');
    out.push(`${b.benchmark === 'starter' ? 'Starter' : 'Backup'} (${b.lineup}): ${b.name}${b.is_compared_player ? ' (one of the two compared players)' : ''}, age ${unknown(b.age)}, CA ${unknown(b.ca)}, PA ${unknown(b.pa)}, familiarity ${unknown(b.familiarity_at_position)}${scores ? `, ${scores}` : ''}`);
  }
  return out.join('\n');
}

/** The SquadLab report as it reads on screen, as plain text. */
export function reportText(report, payload) {
  const names = shortNames(payload);
  const full = { A: payload.players[0].name, B: payload.players[1].name };
  const say = (s) => plainReportText(s, names);
  const v = report.recruitment_verdict, b = report.better_today;
  const c = payload.comparison;
  const out = [];
  out.push(`${VERDICT_LABEL[verdictKind(payload)]}: ${v.choice === 'undecided' ? 'Too close to call' : full[v.choice]}`);
  out.push(say(v.headline));
  out.push(say(v.explanation));
  out.push('');
  out.push(`Better Today: ${b.choice === 'level' ? 'Level' : full[b.choice]}`);
  out.push(say(b.explanation));
  for (const x of b.by_phase || []) {
    if (!PHASE_LABEL[x.phase]) continue;
    const role = c.roles?.[x.phase];
    const sa = payload.players[0].role_fit?.[x.phase]?.squadlab_role_score_out_of_100, sb = payload.players[1].role_fit?.[x.phase]?.squadlab_role_score_out_of_100;
    out.push(`${PHASE_LABEL[x.phase]}${role ? ` (${role.name})` : ''}: ${x.choice === 'level' ? 'Level' : names[x.choice]} (${names.A} ${score(sa)}, ${names.B} ${score(sb)}). ${say(x.explanation)}`);
  }
  out.push('');
  out.push('Evidence:');
  report.evidence.forEach((e, i) => out.push(`${i + 1}. ${say(e)}`));
  if (report.would_change) { out.push(''); out.push(`What Would Change It: ${say(report.would_change)}`); }
  if (c.mode === 'position' && c.position) { out.push(''); out.push(`Based On: General positional comparison at ${c.position.name} (${c.position.code}).`); }
  else if (c.mode === 'general' && report.basis) { out.push(''); out.push(`Based On: ${say(report.basis)}`); }
  return out.join('\n');
}

/**
 * @param {object} payload  buildComparisonRequest(...).payload
 * @param {object|null} report  SquadLab's report for this exact comparison, or null
 * @returns {string} the prompt to paste into ChatGPT
 */
export function buildChatPrompt(payload, report = null) {
  const names = shortNames(payload);
  const kind = verdictKind(payload);
  const [A, B] = payload.players;
  const c = payload.comparison;
  const club = payload.manager_club;
  const verdict = kind === 'squad' ? 'a squad verdict (who to start or favour)' : kind === 'mixed' ? 'a recruitment verdict (whether the target improves my squad enough to justify the fee)' : 'a recruitment verdict (who to sign)';

  const parts = [];
  parts.push(`I'm comparing two Football Manager players for my club using the SquadLab data below. If I've added a specific question under "My follow-up question" at the end, answer it using this data. If that section is blank, give me ${verdict}, then tell me who is better today.${report ? ' A SquadLab report is included: check its reasoning against the player data.' : ''}

Assess each selected role separately using positional familiarity, the key attributes and the supplied SquadLab scores. Explain what drives the gap and give the other player's strongest relevant counterargument. Weigh asking price, age and PA alongside immediate fit. A cheaper player with more upside can be the better signing even if the other player is stronger today. Use the actual figures, treat PA as a ceiling, and only say what would change the verdict if the data supports it.

How to read the data: attributes, positional familiarity and hidden attributes run from 1 to 20. CA and PA run up to 200. A SquadLab role score is the average of the role's scored attributes multiplied by 5, out of 100. The asking price is the assumed transfer fee; "unknown" means it isn't known, so don't estimate it. Money is in GBP.`);

  const ctx = ['CONTEXT', `My club: ${unknown(club)}`, `In-game date of the data: ${dateText(payload.game_date)}`];
  ctx.push(`${A.name}: ${statusOf(A, club)}`);
  ctx.push(`${B.name}: ${statusOf(B, club)}`);
  if (A.snapshot_date !== payload.game_date || B.snapshot_date !== payload.game_date) ctx.push(`Snapshot dates: ${A.name} ${dateText(A.snapshot_date)}, ${B.name} ${dateText(B.snapshot_date)}`);
  parts.push(ctx.join('\n'));
  parts.push(rolesSection(payload, names));
  parts.push(playerSection(A, c, club));
  parts.push(playerSection(B, c, club));
  const bm = benchmarkSection(payload);
  if (bm) parts.push(bm);
  if (payload.budget?.display) parts.push(`BUDGET\nTransfer budget: ${payload.budget.display}`);
  if (report) parts.push(`EXISTING SQUADLAB ANALYSIS\n(SquadLab's AI report for exactly these players, data, position and roles. It is separate from the data above: check its conclusions against those figures.)\n\n${reportText(report, payload)}`);
  parts.push('MY FOLLOW-UP QUESTION\n');
  return parts.join('\n\n');
}

// ---- Player page: Development / Recruitment Report ------------------------------------------

const VERDICT_TEXT = { immediate_upgrade: 'Immediate upgrade', depth: 'Adds depth', development: 'Development signing', pass: 'Pass' };

/** £60.5m / £369k: how fees and ceilings read in the reports. */
export function shortMoney(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  const a = Math.abs(amount);
  if (a >= 1e6) return `£${String(Math.round(a / 1e5) / 10)}m`;
  if (a >= 1e3) return `£${Math.round(a / 1e3)}k`;
  return `£${Math.round(a)}`;
}

/** Price advice as words. */
export function adviceText(price, payload) {
  const ask = payload.player.asking_price;
  if (price.advice === 'pay_asking_price') return ask.status === 'available' ? `Pay the asking price (${shortMoney(ask.amount)})` : 'Pay the asking price';
  if (price.advice === 'buy_below_ceiling') return price.ceiling ? `Only buy below ${shortMoney(price.ceiling)}` : 'Only buy below a lower fee';
  if (price.advice === 'fee_unknown') return 'Asking price unknown';
  return 'Pass at this price';
}

export const verdictText = (v) => VERDICT_TEXT[v] || v;

/** A phase's duties as the role catalogue describes them, or a plain note that they aren't. */
const dutyText = (r) => (r?.description ? `Duties: ${r.description}` : 'Duties for this phase are not described in the role catalogue, so keep to the score and its inputs.');
const roleLine = (fit) => PHASES_TXT.filter((ph) => fit?.[ph]).map((ph) => `${PHASE_LABEL[ph]} ${fit[ph].role}${fit[ph].role_source ? ` (${fit[ph].role_source})` : ''}: score ${score(fit[ph].squadlab_role_score_out_of_100)}; score inputs ${list(fit[ph].key_attributes)}${'description' in fit[ph] ? `. ${dutyText(fit[ph])}` : ''}`).join(' | ');
const PHASES_TXT = ['in_possession', 'out_of_possession'];

function positionsSection(payload) {
  const out = ['POSITIONS (familiarity out of 20; his best SquadLab role scores out of 100)'];
  for (const x of payload.positions) {
    out.push('');
    out.push(`${x.position} (${x.name}): familiarity ${unknown(x.familiarity)}${x.needs_retraining ? ', would need retraining' : ''}`);
    for (const ph of PHASES_TXT) {
      const roles = x.best_roles?.[ph] || [];
      if (!roles.length) continue;
      out.push(`${PHASE_LABEL[ph]}:`);
      for (const r of roles) out.push(`- ${r.name}: score ${score(r.squadlab_role_score_out_of_100)}; score inputs ${list(r.key_attributes)}. ${dutyText(r)}`);
    }
    if (x.position_attributes && Object.keys(x.position_attributes).length) out.push(`Attributes that matter at ${x.position} (lowest first): ${list(x.position_attributes)}`);
  }
  return out.join('\n');
}

function lineupSection(payload) {
  const out = ['MY LINEUP PLACES (First XI, Backup XI, Future XI in a 4-2-3-1; each slot has one saved role pair shared by all three)'];
  if (!payload.lineup_assignments?.length) { out.push('None. Assess him from his profile.'); return out.join('\n'); }
  const primary = payload.lineup_assignments.filter((a) => a.primary);
  out.push(`Primary job: ${primary.map((a) => `${a.lineup} ${a.slot}`).join(' and ')}.`);
  for (const a of payload.lineup_assignments) {
    out.push('');
    out.push(`${a.lineup} ${a.slot} at ${a.position}${a.primary ? ' (primary job)' : ''}, familiarity ${unknown(a.familiarity)}`);
    for (const ph of PHASES_TXT) {
      const f = a.role_fit?.[ph];
      if (f) { out.push(`${PHASE_LABEL[ph]}: ${f.role} (saved for this slot): score ${score(f.squadlab_role_score_out_of_100)}; score inputs ${list(f.key_attributes)}. ${dutyText(f)}`); continue; }
      const cands = a.candidate_roles?.[ph] || [];
      out.push(`${PHASE_LABEL[ph]}: not set for this slot.${a.primary && cands.length ? ` Possible roles (any you pick is a suggestion, not my setup): ${cands.map((r) => `${r.name} ${score(r.squadlab_role_score_out_of_100)} (score inputs ${list(r.key_attributes)})`).join('; ')}` : ''}`);
    }
  }
  return out.join('\n');
}

function formationSection(payload) {
  if (!payload.formation_slots?.length) return null;
  const out = ['FORMATION SLOTS AT HIS POSITIONS (current First / Backup / Future XI holders)'];
  for (const f of payload.formation_slots) for (const sl of f.slots) out.push(`${sl.slot} at ${f.position}: First XI ${sl['First XI'] || 'empty'}, Backup XI ${sl['Backup XI'] || 'empty'}, Future XI ${sl['Future XI'] || 'empty'}${sl.roles ? `; saved roles: ${PHASES_TXT.map((ph) => `${PHASE_LABEL[ph]} ${sl.roles[ph] || 'not set'}`).join(', ')}` : ''}`);
  return out.join('\n');
}

function definitionsSection(payload) {
  const defs = payload.attribute_definitions || {};
  if (!Object.keys(defs).length) return null;
  return ['ATTRIBUTE DEFINITIONS (SquadLab)', ...Object.entries(defs).map(([k, v]) => `${k}: ${v}`)].join('\n');
}

function historySection(payload) {
  const h = payload.development_history;
  if (!h) return 'DEVELOPMENT HISTORY\nOnly one snapshot, so no observed changes. Treat this as his current baseline.';
  const ch = Object.entries(h.changed_attributes || {}).map(([k, v]) => `${k} ${v.from} → ${v.to}`).join(', ');
  return `DEVELOPMENT HISTORY\n${h.snapshots} snapshots from ${dateText(h.from_date)} to ${dateText(h.to_date)}. CA ${unknown(h.ca?.from)} → ${unknown(h.ca?.to)}. Changed attributes: ${ch || 'none'}.`;
}

function squadFitSection(payload) {
  const out = ['MY SQUAD, SLOT BY SLOT (4-2-3-1; each slot has its own saved role pair, shared by First, Backup and Future XI; everyone in a slot is scored on the same roles)'];
  if (!payload.squad_fit?.length) { out.push('None of his positions has a slot in my formation.'); return out.join('\n'); }
  for (const s of payload.squad_fit) {
    out.push('');
    out.push(`${s.slot} (${s.position}, ${s.name}). His familiarity ${unknown(s.his_familiarity)}.`);
    for (const ph of PHASES_TXT) {
      const f = s.his_role_fit?.[ph];
      if (!f) continue;
      out.push(s.saved_roles?.[ph]
        ? `${PHASE_LABEL[ph]}: ${f.role} (saved for ${s.slot}). ${dutyText(f)} ${payload.player.name}: score ${score(f.squadlab_role_score_out_of_100)}; score inputs ${list(f.key_attributes)}`
        : `${PHASE_LABEL[ph]}: not set for ${s.slot}, so this is general positional fit using ${f.role}. ${payload.player.name}: score ${score(f.squadlab_role_score_out_of_100)}; score inputs ${list(f.key_attributes)}`);
    }
    out.push(`Holders: First XI ${s.holders?.['First XI'] || 'empty'}, Backup XI ${s.holders?.['Backup XI'] || 'empty'}, Future XI ${s.holders?.['Future XI'] || 'empty'}`);
    for (const c of s.club_players) {
      out.push(`${c.name} (${c.lineup_places?.length ? c.lineup_places.join(', ') : 'not in First, Backup or Future XI'}; age ${unknown(c.age)}, CA ${unknown(c.ca)}, PA ${unknown(c.pa)}, familiarity ${unknown(c.familiarity)}): ${PHASES_TXT.filter((ph) => c.role_fit?.[ph]).map((ph) => `${PHASE_LABEL[ph]} ${score(c.role_fit[ph].squadlab_role_score_out_of_100)} (${list(c.role_fit[ph].key_attributes)})`).join('; ') || 'no role scores'}`);
    }
    const empty = Object.entries(s.holders || {}).filter(([, v]) => !v).map(([k]) => k);
    if (empty.length) out.push(`Empty in ${empty.join(', ')} (an empty place alone doesn't prove a squad gap).`);
  }
  return out.join('\n');
}

/** The Development or Recruitment Report as it reads on screen. */
export function playerReportText(report, payload) {
  const out = [];
  if (report.report_type === 'development') {
    const bp = report.best_position;
    out.push(`Development Report: ${report.takeaway}`);
    out.push('');
    out.push(`Best Position: ${bp.position}${bp.needs_retraining ? ' (would need retraining)' : ''}. ${bp.explanation}`);
    for (const ph of PHASES_TXT) if (bp[ph]) out.push(`${PHASE_LABEL[ph]}: ${bp[ph].role}. ${bp[ph].explanation}`);
    if (bp.alternative) out.push(`Alternative: ${bp.alternative}`);
    out.push('');
    out.push(`Fit in My Lineups: ${report.lineup_fit}`);
    if (report.suggested_slot) out.push(`Suggested slot (recommendation; he has no lineup place): ${report.suggested_slot.lineup} ${report.suggested_slot.slot}. ${report.suggested_slot.explanation}`);
    for (const ph of PHASES_TXT) {
      const x = report.suggested_roles?.[ph];
      if (x) out.push(`Suggested ${PHASE_LABEL[ph]} role (a suggestion; not set for ${x.lineup} ${x.slot}): ${x.role}. ${x.explanation}`);
    }
    out.push('');
    out.push('Development Priorities:');
    report.priorities.forEach((x, i) => {
      const h = x.history ? ` (${x.history.from} → ${x.history.to} between ${dateText(x.history.from_date)} and ${dateText(x.history.to_date)})` : '';
      out.push(`${i + 1}. ${x.attribute}, currently ${x.current}${h}. ${x.why}`);
    });
    if (report.outlook) { out.push(''); out.push(`Outlook: ${report.outlook}`); }
  } else {
    const bf = report.best_fit;
    out.push(`Recruitment Report: ${verdictText(report.verdict)}`);
    out.push(report.headline);
    out.push(report.explanation);
    out.push('');
    out.push(`Best Fit: ${bf.slot ? `${bf.slot} (${bf.position})` : bf.position}. ${bf.explanation}`);
    if (bf.in_possession) out.push(`In Possession: ${bf.in_possession}`);
    if (bf.out_of_possession) out.push(`Out of Possession: ${bf.out_of_possession}`);
    if (report.competition.length) {
      out.push('');
      out.push('Competition:');
      for (const c of report.competition) out.push(`- ${c.name}: ${c.comparison}`);
    }
    out.push('');
    out.push(`Price: ${adviceText(report.price, payload)}. ${report.price.explanation}`);
    out.push('');
    out.push('Evidence:');
    report.evidence.forEach((e, i) => out.push(`${i + 1}. ${e}`));
  }
  return out.join('\n');
}

/**
 * @param {object} payload  buildPlayerRequest(...).payload
 * @param {object|null} report  SquadLab's report for exactly this player and context, or null
 */
export function buildPlayerChatPrompt(payload, report = null) {
  const dev = payload.report_type === 'development';
  const p = payload.player;
  const club = payload.manager_club;
  const parts = [];
  const ask = dev
    ? `give me a development report: his best natural fit (position and roles in and out of possession, from his familiarity and attributes, flagging any position that would need retraining); the job I've given him, led by his First XI place if he has one, then Backup XI, then Future XI, with the roles saved for that slot, kept distinct from his best natural fit (if he holds more than one slot at that level, name them and explain any difference that matters; if a phase isn't set, label any role you propose as a suggestion; if he has no place, say so, assess him from his profile and, if the evidence supports it, suggest one specific slot, labelled as a recommendation); and two or three development priorities for that job, considering both phases, ranked by what improving each would help him do there, with his current value and the specific action it affects. A low number alone is not a reason, and an attribute outside the role score can still come first if his job needs it. If a priority depends on a tactical instruction that isn't in the data, make it conditional. Lead with one concrete takeaway.`
    : `give me a recruitment report: his best fit in the tactic I actually use, judging him slot by slot on each slot's saved roles and his familiarity in both phases (slots at the same position can have different jobs; where a role isn't set, say that part is general positional fit), leading with his best slot and its roles and comparing him by name with that slot's starter, backup and future option and the other club players listed; a verdict (immediate upgrade, depth, development signing or pass) naming who he'd compete with or displace; and price advice. The asking price is the assumed transfer fee: say pay it, only buy below a ceiling (give a number only when the data supports it, and explain it) or pass. If the fee is unknown, still give the footballing verdict and say what would make the deal worthwhile. An empty lineup place alone doesn't prove a squad gap, so check the club players who can already play there.`;
  parts.push(`I manage ${club || 'a club'} in Football Manager. ${dev ? `${p.name} is one of my players.` : `${p.name} is an external player I'm considering.`} Using the SquadLab data below, if I've added a specific question under "My follow-up question" at the end, answer it using this data. If that section is blank, ${ask}${report ? ' A SquadLab report is included: check its reasoning against the data.' : ''}

Ground every claim in the figures, treat SquadLab role scores as evidence and explain the attributes behind them, and only add caveats that matter to the decision.

Use the attribute definitions below and don't stretch them. In particular: Positioning is defensive positioning (where he places himself when defending, such as screening passing lanes or covering space), so only recommend it for a concrete defensive responsibility; Off the Ball is attacking movement (finding pockets, offering passing options, moving after releasing the ball); Work Rate is the urgency and effort he puts into his duties (sustained pressing, recovery runs), not speed, which is Acceleration and Pace.

Keep In Possession and Out of Possession distinct, and describe each phase's duties only from that role's description for that phase. A SquadLab score just averages its score inputs: an input such as Passing or First Touch in an out-of-possession score is not an out-of-possession duty. Where a phase's duties aren't described, stick to the score and its inputs.

Use age, CA, PA and any observed development history for the outlook. PA is a ceiling, not a promise: with a single snapshot, describe the current baseline and don't predict whether or when he'll reach it. Contract length only tells us how long he's signed for.

How to read the data: attributes, positional familiarity and hidden attributes run from 1 to 20 (15+ familiarity means he can play the position now). CA and PA run up to 200. A SquadLab role score is the average of the role's key attributes multiplied by 5, out of 100. Money is in GBP.`);
  parts.push(['CONTEXT', `My club: ${unknown(club)}`, `In-game date of the data: ${dateText(payload.game_date)}`, `${p.name}: ${statusOf(p, club)}`, `Report: ${dev ? 'Development Report (my player)' : 'Recruitment Report (external player)'}`].join('\n'));
  parts.push(playerSection(p, { position: null }, club));
  parts.push(positionsSection(payload));
  if (dev) { parts.push(lineupSection(payload)); const f = formationSection(payload); if (f) parts.push(f); parts.push(historySection(payload)); }
  else parts.push(squadFitSection(payload));
  if (payload.budget?.display) parts.push(`BUDGET\nTransfer budget: ${payload.budget.display}`);
  const defs = definitionsSection(payload);
  if (defs) parts.push(defs);
  if (report) parts.push(`EXISTING SQUADLAB ANALYSIS\n(SquadLab's AI report for exactly this player, data and squad context. It is separate from the data above: check its conclusions against those figures.)\n\n${playerReportText(report, payload)}`);
  parts.push('MY FOLLOW-UP QUESTION\n');
  return parts.join('\n\n');
}
