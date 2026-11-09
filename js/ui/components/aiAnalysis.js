// AI Analysis on Comparison: one button that sends the comparison being shown
// to the Worker and opens the report in a sheet.
//
// Requests and reports are keyed by the comparison's signature (both players,
// their snapshots, position and roles). A report is only ever shown for the
// signature it was requested for, so changing a player or role can't show an
// earlier answer. One request per signature runs at a time: closing the sheet
// while it loads and tapping again re-attaches to it. Reports are kept for the
// session, so reopening the same comparison doesn't ask again. The Worker's
// access code is asked for once per device, and again if it's refused.

import { h } from '../dom.js';
import { openSheet } from './sheet.js';
import { requestComparison, AnalysisError, getAccessCode, setAccessCode, shortNames, verdictKind, plainReportText } from '../../data/aiClient.js';

const cache = new Map();   // signature → report (session)
const CACHE_MAX = 12;
let inflight = null;       // { signature, promise, controller }

function remember(sig, report) {
  cache.delete(sig);
  cache.set(sig, report);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

/** The request for this signature: the running one, or a new one (cancelling a different one). */
function start(req) {
  if (inflight?.signature === req.signature) return inflight.promise;
  inflight?.controller.abort();
  const controller = new AbortController();
  const entry = { signature: req.signature, controller, promise: null };
  entry.promise = requestComparison(req.payload, { signal: controller.signal })
    .then((report) => { remember(req.signature, report); return report; })
    .finally(() => { if (inflight === entry) inflight = null; });
  inflight = entry;
  return entry.promise;
}

const PHASE_LABEL = { in_possession: 'In Possession', out_of_possession: 'Out of Possession' };
const VERDICT_LABEL = { recruitment: 'Recruitment Verdict', mixed: 'Recruitment Verdict', squad: 'Squad Verdict' };

const scoreText = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '–');

function reportView(report, req) {
  const payload = req.payload;
  const names = shortNames(payload);
  const say = (s) => plainReportText(s, names);
  const fullName = (c) => req.names[c];
  const v = report.recruitment_verdict, b = report.better_today;
  const verdictName = v.choice === 'undecided' ? 'Too close to call' : fullName(v.choice);
  const todayName = b.choice === 'level' ? 'Level' : fullName(b.choice);
  const cmp = payload.comparison;
  const [pa, pb] = payload.players;
  const phaseCard = (x) => {
    const role = cmp.roles?.[x.phase];
    return h('li', { class: 'ai-phase' },
      h('span', { class: 'ai-phase-head' }, PHASE_LABEL[x.phase] || 'Phase', h('b', {}, x.choice === 'level' ? 'Level' : names[x.choice])),
      role ? h('span', { class: 'ai-phase-role' }, role.name) : null,
      h('span', { class: 'ai-phase-scores' },
        h('span', {}, names.A, ' ', h('b', {}, scoreText(pa.role_fit?.[x.phase]?.squadlab_role_score_out_of_100))),
        h('span', {}, names.B, ' ', h('b', {}, scoreText(pb.role_fit?.[x.phase]?.squadlab_role_score_out_of_100)))),
      h('span', { class: 'ai-text' }, say(x.explanation)));
  };
  // Role mode is described by the header; otherwise say what the comparison rests on.
  const basis = cmp.mode === 'position' && cmp.position
    ? `General positional comparison at ${cmp.position.name} (${cmp.position.code}).`
    : cmp.mode === 'general' ? say(report.basis) : null;
  return h('div', { class: 'ai-report' },
    h('section', { class: 'ai-verdict', 'aria-label': VERDICT_LABEL[verdictKind(payload)] },
      h('p', { class: 'ai-kicker' }, VERDICT_LABEL[verdictKind(payload)]),
      h('p', { class: 'ai-pick' }, verdictName),
      h('p', { class: 'ai-headline' }, say(v.headline)),
      h('p', { class: 'ai-text' }, say(v.explanation))),
    h('section', { class: 'ai-sec', 'aria-label': 'Better Today' },
      h('p', { class: 'ai-kicker' }, 'Better Today'),
      h('p', { class: 'ai-pick ai-pick-sm' }, todayName),
      h('p', { class: 'ai-text' }, say(b.explanation)),
      b.by_phase?.length ? h('ul', { class: 'ai-phases' }, b.by_phase.filter((x) => PHASE_LABEL[x.phase]).map(phaseCard)) : null),
    h('section', { class: 'ai-sec', 'aria-label': 'Evidence' },
      h('p', { class: 'ai-kicker' }, 'Evidence'),
      h('ol', { class: 'ai-evidence' }, report.evidence.map((e) => h('li', {}, say(e))))),
    report.would_change ? h('section', { class: 'ai-sec', 'aria-label': 'What Would Change It' },
      h('p', { class: 'ai-kicker' }, 'What Would Change It'),
      h('p', { class: 'ai-text' }, say(report.would_change))) : null,
    basis ? h('section', { class: 'ai-sec', 'aria-label': 'Based On' },
      h('p', { class: 'ai-kicker' }, 'Based On'),
      h('p', { class: 'ai-text' }, basis)) : null);
}

function loadingView() {
  return h('div', { class: 'ai-loading', role: 'status', 'aria-live': 'polite' },
    h('span', { class: 'ai-spinner', 'aria-hidden': 'true' }),
    h('span', {}, 'Analysing…'));
}

function errorView(err) {
  const msg = err instanceof AnalysisError ? err.message : 'Something went wrong.';
  return h('div', { class: 'ai-error', role: 'alert' }, h('p', { class: 'ai-error-title' }, 'Analysis failed'), h('p', { class: 'ai-text' }, msg));
}

/** Access code field; `onSave(code)` runs with the trimmed code. */
function codeView(refused, onSave) {
  const input = h('input', {
    type: 'password', class: 'picker-search ai-code-input', id: 'ai-code', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    enterkeyhint: 'go', onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } },
  });
  const submit = () => { const v = input.value.trim(); if (v) onSave(v); else input.focus(); };
  const el = h('form', { class: 'field ai-code', onsubmit: (e) => { e.preventDefault(); submit(); } },
    h('label', { class: 'field-label', for: 'ai-code' }, 'Access code'),
    input,
    refused ? h('p', { class: 'ai-code-err', role: 'alert' }, 'That access code wasn’t accepted.') : null);
  return { el, submit, focus: () => input.focus() };
}

function openReport(req) {
  const body = h('div', { class: 'ai-body' });
  let open = true;
  const s = openSheet({
    title: 'AI Analysis',
    content: [h('p', { class: 'ai-basis' }, req.basisText), body],
    actions: [],
    onClose: () => { open = false; },
  });
  s.el.classList.add('ai-sheet');
  const closeAction = { label: 'Close', kind: 'secondary', onClick: (close) => close() };

  const show = (node, actions) => { if (!open) return; body.replaceChildren(node); s.setActions(actions); };
  const askCode = (refused) => {
    const v = codeView(refused, (code) => { setAccessCode(code); run(); });
    show(v.el, [{ label: 'Save and analyse', onClick: () => v.submit() }, closeAction]);
    if (open) v.focus();
  };
  const run = () => {
    const cached = cache.get(req.signature);
    if (cached) { show(reportView(cached, req), [closeAction]); return; }
    if (!getAccessCode()) { askCode(false); return; }
    show(loadingView(), [closeAction]);
    start(req).then(
      (report) => show(reportView(report, req), [closeAction]),
      (err) => {
        if (err?.code === 'cancelled') return;
        if (err?.code === 'unauthorized' || err?.code === 'no_code') { setAccessCode(''); askCode(err.code === 'unauthorized'); return; }
        show(errorView(err), [{ label: 'Retry', onClick: () => run() }, closeAction]);
      },
    );
  };
  run();
}

/**
 * @param {object} o
 *   getRequest() → { payload, signature, names: { A, B }, basisText } | null
 *   (null: two distinct players aren't selected)
 */
export function AiAnalysisButton(o) {
  const ready = !!o.getRequest();
  return h('button', {
    type: 'button', class: 'btn btn-primary btn-block ai-btn', disabled: !ready,
    onclick: () => { const req = o.getRequest(); if (req) openReport(req); },
  }, h('span', { class: 'ai-btn-mark', 'aria-hidden': 'true' }, '✦'), 'AI Analysis');
}

/** For tests: forget cached reports and any running request. */
export function resetAiAnalysis() {
  cache.clear();
  inflight?.controller.abort();
  inflight = null;
}
