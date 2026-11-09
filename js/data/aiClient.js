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
