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
