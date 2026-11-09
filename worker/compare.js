// POST /compare — SquadLab's AI Analysis for Comparison.
//
// The app sends structured comparison data (squadlab.compare.v1). This module
// validates it, asks the model with the fixed instructions in comparePrompt.js,
// validates the structured answer and returns it:
//   200 { ok: true, comparison_id, report }
//   4xx/5xx { ok: false, error: { code, message } }
// The provider key stays in the Worker's secrets (ANTHROPIC_API_KEY).

import { SYSTEM_PROMPT, REPORT_TOOL, PROMPT_VERSION } from './comparePrompt.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-5-5';
const MAX_BODY_BYTES = 96 * 1024;
const PHASES = ['in_possession', 'out_of_possession'];

export class CompareError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const bad = (message) => { throw new CompareError(400, 'invalid_request', message); };

// ---- Request validation -------------------------------------------------------------

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const intOrNull = (v, min, max) => v === null || isInt(v, min, max);
const strOrNull = (v, max = 200) => v === null || (typeof v === 'string' && v.length <= max);

/** Generic bounds on any value: depth, sizes, finite numbers, short keys. */
function checkShape(v, path = 'body', depth = 0) {
  if (depth > 7) bad(`${path} is nested too deeply.`);
  if (v === null || typeof v === 'boolean') return;
  if (typeof v === 'number') { if (!Number.isFinite(v)) bad(`${path} is not a finite number.`); return; }
  if (typeof v === 'string') { if (v.length > 1500) bad(`${path} is too long.`); return; }
  if (Array.isArray(v)) {
    if (v.length > 60) bad(`${path} has too many items.`);
    v.forEach((x, i) => checkShape(x, `${path}[${i}]`, depth + 1));
    return;
  }
  if (isObj(v)) {
    const keys = Object.keys(v);
    if (keys.length > 80) bad(`${path} has too many fields.`);
    for (const k of keys) { if (k.length > 60) bad(`${path} has a field name that is too long.`); checkShape(v[k], `${path}.${k}`, depth + 1); }
    return;
  }
  bad(`${path} has an unsupported value.`);
}

function checkMoney(m, path) {
  if (m === null) return;
  if (!isObj(m) || typeof m.amount !== 'number' || m.amount < 0 || typeof m.display !== 'string') bad(`${path} must be { amount, display } or null.`);
}

function checkValues(obj, path, min, max) {
  if (!isObj(obj)) bad(`${path} must be an object.`);
  for (const [k, v] of Object.entries(obj)) {
    if (isObj(v)) checkValues(v, `${path}.${k}`, min, max);
    else if (!intOrNull(v, min, max)) bad(`${path}.${k} must be a whole number from ${min} to ${max}, or null.`);
  }
}

function checkPlayer(p, label, phases, hasPosition) {
  const path = `players.${label}`;
  if (!isObj(p) || p.label !== label) bad(`${path} is missing or mislabelled.`);
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 120) bad(`${path}.name is required.`);
  if (!intOrNull(p.age, 10, 60)) bad(`${path}.age is invalid.`);
  if (!intOrNull(p.ca, 0, 200) || !intOrNull(p.pa, 1, 200)) bad(`${path}.ca / pa are invalid.`);
  if (!strOrNull(p.club) || typeof p.at_manager_club !== 'boolean') bad(`${path}.club / at_manager_club are invalid.`);
  checkValues(p.attributes, `${path}.attributes`, 1, 20);
  checkValues(p.position_familiarity, `${path}.position_familiarity`, 1, 20);
  checkValues(p.hidden_attributes || {}, `${path}.hidden_attributes`, 0, 20);
  checkValues(p.personality || {}, `${path}.personality`, 0, 20);
  if (!Array.isArray(p.traits) || !p.traits.every((t) => typeof t === 'string')) bad(`${path}.traits must be a list.`);
  if (p.preferred_foot !== null && !(isObj(p.preferred_foot) && ['Left', 'Right', 'Both'].includes(p.preferred_foot.preferred))) bad(`${path}.preferred_foot is invalid.`);
  const ask = p.asking_price;
  if (!isObj(ask) || !['available', 'missing', 'not_applicable'].includes(ask.status)) bad(`${path}.asking_price.status is invalid.`);
  if (ask.status === 'available' && !(typeof ask.amount === 'number' && ask.amount > 0 && typeof ask.display === 'string')) bad(`${path}.asking_price needs a positive amount.`);
  if (ask.status !== 'available' && 'amount' in ask) bad(`${path}.asking_price has an amount but isn't available.`);
  if ((ask.status === 'not_applicable') !== p.at_manager_club) bad(`${path}.asking_price doesn't match at_manager_club.`);
  checkMoney(p.monthly_salary, `${path}.monthly_salary`);
  if (!strOrNull(p.contract_expiry, 10)) bad(`${path}.contract_expiry is invalid.`);
  if (!Array.isArray(p.release_clauses)) bad(`${path}.release_clauses must be a list.`);
  p.release_clauses.forEach((c, i) => checkMoney(c?.fee ?? null, `${path}.release_clauses[${i}].fee`));
  if (hasPosition && !intOrNull(p.familiarity_at_position ?? null, 1, 20)) bad(`${path}.familiarity_at_position is invalid.`);
  for (const ph of phases) {
    const fit = p.role_fit?.[ph];
    if (!isObj(fit) || !isObj(fit.key_attributes)) bad(`${path}.role_fit.${ph} is missing.`);
    checkValues(fit.key_attributes, `${path}.role_fit.${ph}.key_attributes`, 1, 20);
  }
}

/** Throws CompareError(400) when the comparison data isn't usable. */
export function validateRequest(body) {
  if (!isObj(body)) bad('Expected a JSON object.');
  checkShape(body);
  if (body.schema !== 'squadlab.compare.v1') bad('Unsupported schema.');
  if (typeof body.comparison_id !== 'string' || !/^cmp_[a-z0-9_]{1,40}$/.test(body.comparison_id)) bad('comparison_id is invalid.');
  const c = body.comparison;
  if (!isObj(c) || !['general', 'position', 'role'].includes(c.mode)) bad('comparison.mode is invalid.');
  if (!Array.isArray(c.assessed_phases) || !c.assessed_phases.every((x) => PHASES.includes(x)) || new Set(c.assessed_phases).size !== c.assessed_phases.length) bad('comparison.assessed_phases is invalid.');
  const hasPosition = isObj(c.position);
  if ((c.mode === 'general') === hasPosition) bad('comparison.position doesn\'t match the mode.');
  if ((c.mode === 'role') !== (c.assessed_phases.length > 0)) bad('comparison.assessed_phases doesn\'t match the mode.');
  for (const ph of PHASES) {
    const role = c.roles?.[ph] ?? null;
    if (c.assessed_phases.includes(ph) ? !(isObj(role) && typeof role.name === 'string' && Array.isArray(role.key_attributes) && role.key_attributes.length) : role !== null) bad(`comparison.roles.${ph} is invalid.`);
  }
  if (!Array.isArray(body.players) || body.players.length !== 2) bad('Exactly two players are required.');
  checkPlayer(body.players[0], 'A', c.assessed_phases, hasPosition);
  checkPlayer(body.players[1], 'B', c.assessed_phases, hasPosition);
  if (body.benchmarks !== undefined && (!Array.isArray(body.benchmarks) || body.benchmarks.length > 8)) bad('benchmarks is invalid.');
  if (body.budget !== undefined) checkMoney(body.budget, 'budget');
  return body;
}

// ---- Response validation ---------------------------------------------------------------

const text = (v, maxWords) => typeof v === 'string' && v.trim().length > 0 && v.trim().split(/\s+/).length <= maxWords;
const clean = (v) => v.replace(/\s+/g, ' ').trim();

/**
 * Checks the model's report against the request (phases covered, choices valid,
 * lengths) and returns a clean copy, or a list of problems.
 */
export function validateReport(r, request) {
  const problems = [];
  const phases = request.comparison.assessed_phases;
  if (!isObj(r)) return { problems: ['The report is not an object.'] };
  const v = r.recruitment_verdict, b = r.better_today;
  if (!isObj(v) || !['A', 'B', 'undecided'].includes(v.choice)) problems.push('recruitment_verdict.choice must be A, B or undecided.');
  if (!text(v?.headline, 35)) problems.push('recruitment_verdict.headline must be one short sentence.');
  if (!text(v?.explanation, 120)) problems.push('recruitment_verdict.explanation is missing or too long.');
  if (!isObj(b) || !['A', 'B', 'level'].includes(b.choice)) problems.push('better_today.choice must be A, B or level.');
  if (!text(b?.explanation, 90)) problems.push('better_today.explanation is missing or too long.');
  const byPhase = Array.isArray(b?.by_phase) ? b.by_phase : [];
  const seen = byPhase.map((x) => x?.phase);
  if (seen.length !== phases.length || !phases.every((ph) => seen.includes(ph))) problems.push(`better_today.by_phase must have exactly one entry for each assessed phase (${phases.join(', ') || 'none'}).`);
  if (!byPhase.every((x) => isObj(x) && ['A', 'B', 'level'].includes(x.choice) && text(x.explanation, 70))) problems.push('Each by_phase entry needs a choice (A, B or level) and a short explanation.');
  if (!Array.isArray(r.evidence) || r.evidence.length < 1 || r.evidence.length > 3 || !r.evidence.every((e) => text(e, 70))) problems.push('evidence must be one to three short sentences.');
  if (!(r.would_change === null || r.would_change === undefined || text(r.would_change, 80))) problems.push('would_change must be one sentence or null.');
  if (!text(r.basis, 50)) problems.push('basis must be one short sentence.');
  if (problems.length) return { problems };
  return {
    report: {
      recruitment_verdict: { choice: v.choice, headline: clean(v.headline), explanation: clean(v.explanation) },
      better_today: {
        choice: b.choice,
        explanation: clean(b.explanation),
        ...(phases.length ? { by_phase: phases.map((ph) => byPhase.find((x) => x.phase === ph)).map((x) => ({ phase: x.phase, choice: x.choice, explanation: clean(x.explanation) })) } : {}),
      },
      evidence: r.evidence.map(clean),
      would_change: r.would_change ? clean(r.would_change) : null,
      basis: clean(r.basis),
    },
  };
}

// ---- Provider ------------------------------------------------------------------------------

/** The data as the model sees it; "<" is escaped so a name can't close the data tag. */
export function dataMessage(body) {
  const { comparison_id, schema, ...data } = body; // ids aren't useful to the model
  return `<comparison_data>\n${JSON.stringify(data, null, 1).replace(/</g, '\\u003c')}\n</comparison_data>`;
}

async function callModel(env, messages, fetchImpl) {
  const res = await fetchImpl(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      max_tokens: 1600,
      system: SYSTEM_PROMPT,
      tools: [REPORT_TOOL],
      tool_choice: { type: 'tool', name: REPORT_TOOL.name },
      messages,
    }),
  });
  if (!res.ok) {
    const status = res.status;
    if (status === 429 || status === 529) throw new CompareError(503, 'busy', 'The analysis service is busy. Try again in a moment.');
    throw new CompareError(502, 'provider_error', `The analysis service returned an error (${status}).`);
  }
  const data = await res.json();
  const block = (data.content || []).find((c) => c.type === 'tool_use' && c.name === REPORT_TOOL.name);
  return { block, content: data.content || [] };
}

/**
 * Validated report for a validated request. One retry when the model's answer
 * doesn't pass validation, with the problems listed.
 */
export async function analyse(body, env, fetchImpl = fetch) {
  if (!env.ANTHROPIC_API_KEY) throw new CompareError(500, 'not_configured', 'The analysis service isn’t configured.');
  const messages = [{ role: 'user', content: dataMessage(body) }];
  for (let attempt = 0; attempt < 2; attempt++) {
    const { block, content } = await callModel(env, messages, fetchImpl);
    const checked = block ? validateReport(block.input, body) : { problems: ['Call submit_recruitment_report.'] };
    if (checked.report) return checked.report;
    if (!block) break;
    messages.push({ role: 'assistant', content });
    messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: block.id, is_error: true, content: `Fix these and call the tool again: ${checked.problems.join(' ')}` }] });
  }
  throw new CompareError(502, 'invalid_report', 'The analysis came back incomplete. Try again.');
}

/** Full handler: JSON in, JSON out (CORS headers are added by the caller). */
export async function handleCompare(request, env, fetchImpl = fetch) {
  try {
    if (request.method !== 'POST') throw new CompareError(405, 'method_not_allowed', 'Use POST.');
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) throw new CompareError(413, 'too_large', 'The comparison is too large.');
    let body;
    try { body = JSON.parse(raw); } catch { bad('The body is not valid JSON.'); }
    validateRequest(body);
    const report = await analyse(body, env, fetchImpl);
    return json(200, { ok: true, comparison_id: body.comparison_id, prompt_version: PROMPT_VERSION, report });
  } catch (e) {
    if (e instanceof CompareError) return json(e.status, { ok: false, error: { code: e.code, message: e.message } });
    return json(500, { ok: false, error: { code: 'internal', message: 'Something went wrong in the analysis service.' } });
  }
}

const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
