// AI Analysis: the call to SquadLab's Cloudflare Worker. The Worker holds the
// provider key and the fixed analyst instructions; the app only sends the
// structured comparison and receives a validated structured report.
// Every call carries the Worker's access code (entered once per device, kept in
// this browser only — never in app backups).

export const WORKER_URL = 'https://squadlab-worker.romain-96d.workers.dev';
export const COMPARE_ENDPOINT = `${WORKER_URL}/compare`;
const TIMEOUT_MS = 90_000;
const CODE_KEY = 'squadlab:ai-access-code';

/** The access code saved on this device, or ''. */
export function getAccessCode() {
  try { return localStorage.getItem(CODE_KEY) || ''; } catch { return ''; }
}
export function setAccessCode(code) {
  try { if (code) localStorage.setItem(CODE_KEY, code); else localStorage.removeItem(CODE_KEY); } catch { /* private mode: asked again next time */ }
}

export class AnalysisError extends Error {
  constructor(message, code = 'error') { super(message); this.code = code; }
}

const CHOICES = new Set(['A', 'B']);
const PHASE_IDS = new Set(['in_possession', 'out_of_possession']);
const text = (v, max) => typeof v === 'string' && v.trim() && v.length <= max;

/** The report the Worker returns, checked again here before it's shown. Returns the report or null. */
export function validReport(r) {
  if (!r || typeof r !== 'object') return null;
  const v = r.recruitment_verdict, b = r.better_today;
  if (!v || !(CHOICES.has(v.choice) || v.choice === 'undecided') || !text(v.headline, 300) || !text(v.explanation, 1200)) return null;
  if (!b || !(CHOICES.has(b.choice) || b.choice === 'level') || !text(b.explanation, 1200)) return null;
  if (b.by_phase !== undefined && (!Array.isArray(b.by_phase) || b.by_phase.length > 2
    || !b.by_phase.every((x) => x && PHASE_IDS.has(x.phase) && (CHOICES.has(x.choice) || x.choice === 'level') && text(x.explanation, 600)))) return null;
  if (!Array.isArray(r.evidence) || r.evidence.length < 1 || r.evidence.length > 3 || !r.evidence.every((e) => text(e, 600))) return null;
  if (r.would_change !== null && r.would_change !== undefined && !text(r.would_change, 800)) return null;
  if (!text(r.basis, 400)) return null;
  return r;
}

/**
 * POST the comparison; resolves the validated report. The response must carry
 * the same comparison_id that was sent, so an answer can never be shown for a
 * different comparison. `signal` cancels the request. Errors carry the
 * Worker's code (e.g. 'unauthorized', 'rate_limited', 'daily_limit').
 */
export async function requestComparison(payload, { signal, code = getAccessCode() } = {}) {
  if (!code) throw new AnalysisError('Enter the access code.', 'no_code');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new AnalysisError('The analysis took too long.', 'timeout')), TIMEOUT_MS);
  const onAbort = () => ctrl.abort(signal.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  let res;
  try {
    res = await fetch(COMPARE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${code}` },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (signal?.aborted) throw new AnalysisError('Cancelled.', 'cancelled');
    if (ctrl.signal.reason instanceof AnalysisError) throw ctrl.signal.reason;
    throw new AnalysisError('Couldn’t reach the analysis service.', 'network');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
  let body = null;
  try { body = await res.json(); } catch { /* handled below */ }
  if (!res.ok || !body?.ok) {
    const msg = body?.error?.message;
    throw new AnalysisError(typeof msg === 'string' && msg.length < 200 ? msg : `The analysis service returned an error (${res.status}).`, body?.error?.code || 'http');
  }
  if (body.comparison_id !== payload.comparison_id) throw new AnalysisError('The analysis didn’t match this comparison.', 'mismatch');
  const report = validReport(body.report);
  if (!report) throw new AnalysisError('The analysis came back incomplete.', 'invalid');
  return report;
}

// ---- Report wording ----------------------------------------------------------------------
// The Worker already writes names and plain phase words; this second pass makes
// sure no placeholder ("Player A", "B's") or identifier (in_possession) can
// reach the page, whatever comes back.

const NAME_PARTICLES = new Set(['de', 'da', 'do', 'dos', 'das', 'di', 'del', 'della', 'van', 'von', 'der', 'den', 'le', 'la', 'du', 'ten', 'ter', 'el', 'al', 'bin', 'ben']);

/** Surname for sentences: last word plus particles ("De Ketelaere"); a single name stays whole. */
export function surnameOf(full) {
  const t = String(full || '').trim().split(/\s+/);
  if (t.length < 2) return t[0] || '';
  let i = t.length - 1;
  while (i > 0 && NAME_PARTICLES.has(t[i - 1].toLowerCase())) i--;
  return t.slice(i).join(' ');
}

/** { A, B } short names for the report; full names when the surnames are the same. */
export function shortNames(payload) {
  const [a, b] = payload.players;
  const sa = surnameOf(a.name), sb = surnameOf(b.name);
  return sa.toLowerCase() === sb.toLowerCase() ? { A: a.name, B: b.name } : { A: sa, B: sb };
}

/** 'squad' (both at the club), 'mixed' (one target) or 'recruitment' (two targets). */
export function verdictKind(payload) {
  const own = payload.players.filter((p) => p.at_manager_club).length;
  return own === 2 ? 'squad' : own === 1 ? 'mixed' : 'recruitment';
}

const VERB_AFTER = '(?:and|or|vs|versus|is|has|had|was|offers|scores|scored|leads|edges|wins|costs|would|should|could|outscores|holds|brings|gives|provides|remains|fits|looks|needs|matches|trails)';

/** Text with identifiers turned into words and A/B placeholders into names. */
export function plainReportText(s, names) {
  if (typeof s !== 'string') return s;
  const a = names.A, b = names.B;
  return s
    .replace(/\bin_possession\b/g, 'in possession').replace(/\bout_of_possession\b/g, 'out of possession')
    .replace(/\bsquadlab_role_score_out_of_100\b/g, 'role score')
    .replace(/\b(?:recruitment_verdict|better_today|by_phase|would_change|asking_price|role_fit|key_attributes)\b/g, (m) => m.replace(/_/g, ' '))
    .replace(/\b[Pp]layer\s+A\b/g, a).replace(/\b[Pp]layer\s+B\b/g, b)
    .replace(/\bA(['’])s\b/g, `${a}$1s`).replace(/\bB(['’])s\b/g, `${b}$1s`)
    .replace(/\s*\(\s*[AB]\s*\)/g, '')
    .replace(/(^|[^\w£'’-])B(?![\w'’-])/g, `$1${b}`)
    .replace(new RegExp(`\\bA(?=\\s+${VERB_AFTER}\\b)`, 'g'), a)
    .replace(/\b(than|over|to|with|and|or|vs|versus|for|from)\s+A(?=[\s.,;:!?)]|$)(?!\s+[a-z])/g, `$1 ${a}`)
    .replace(/\s+/g, ' ').trim();
}
