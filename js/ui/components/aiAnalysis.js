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
import { requestComparison, AnalysisError, getAccessCode, setAccessCode } from '../../data/aiClient.js';

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

function reportView(report, req) {
  const nameOf = (c) => req.names[c];
  const v = report.recruitment_verdict, b = report.better_today;
  const verdictName = v.choice === 'undecided' ? 'Too close to call' : nameOf(v.choice);
  const todayName = b.choice === 'level' ? 'Level' : nameOf(b.choice);
  return h('div', { class: 'ai-report' },
    h('section', { class: 'ai-verdict', 'aria-label': 'Recruitment verdict' },
      h('p', { class: 'ai-kicker' }, 'Recruitment verdict'),
      h('p', { class: 'ai-pick' }, verdictName),
      h('p', { class: 'ai-headline' }, v.headline),
      h('p', { class: 'ai-text' }, v.explanation)),
    h('section', { class: 'ai-sec', 'aria-label': 'Better for the role today' },
      h('p', { class: 'ai-kicker' }, 'Better today'),
      h('p', { class: 'ai-pick ai-pick-sm' }, todayName),
      h('p', { class: 'ai-text' }, b.explanation),
      b.by_phase?.length ? h('ul', { class: 'ai-phases' }, b.by_phase.map((x) => h('li', { class: 'ai-phase' },
        h('span', { class: 'ai-phase-head' }, PHASE_LABEL[x.phase], h('b', {}, x.choice === 'level' ? 'Level' : nameOf(x.choice))),
        h('span', { class: 'ai-text' }, x.explanation)))) : null),
    h('section', { class: 'ai-sec', 'aria-label': 'Evidence' },
      h('p', { class: 'ai-kicker' }, 'Evidence'),
      h('ol', { class: 'ai-evidence' }, report.evidence.map((e) => h('li', {}, e)))),
    report.would_change ? h('section', { class: 'ai-sec', 'aria-label': 'What would change it' },
      h('p', { class: 'ai-kicker' }, 'What would change it'),
      h('p', { class: 'ai-text' }, report.would_change)) : null,
    req.payload.comparison.mode !== 'role' ? h('section', { class: 'ai-sec', 'aria-label': 'Based on' },
      h('p', { class: 'ai-kicker' }, 'Based on'),
      h('p', { class: 'ai-text' }, report.basis)) : null);
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
