// The player page's AI reports, drawn in the same sheet and style as
// Comparison's: a Development Report for the manager's own players, a
// Recruitment Report for anyone else. Figures shown beside the model's words
// (current values, history, asking price, lineup places, role scores) come
// from the request data, not from the model.

import { h } from '../dom.js';
import { formatGameDate } from '../../data/snapshot.js';
import { shortMoney, adviceText, verdictText } from '../../data/chatPrompt.js';

const PHASE_LABEL = { in_possession: 'In Possession', out_of_possession: 'Out of Possession' };
const PHASES = ['in_possession', 'out_of_possession'];
const score = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 10) / 10) : '–');
const sec = (label, ...kids) => h('section', { class: 'ai-sec', 'aria-label': label }, h('p', { class: 'ai-kicker' }, label), ...kids);

/** A phase card: role, SquadLab score, its Key attributes (score inputs) and Preferred attributes (context). */
function phaseCard(ph, roleName, scoreValue, explanation, fit = null) {
  const vals = (o) => Object.entries(o || {}).map(([k, v]) => `${k} ${v ?? '–'}`).join(' · ');
  const key = vals(fit?.key_attributes), pref = vals(fit?.preferred_attributes);
  if (fit?.score_incomplete) scoreValue = undefined;
  return h('li', { class: 'ai-phase' },
    h('span', { class: 'ai-phase-head' }, PHASE_LABEL[ph], scoreValue !== undefined ? h('b', {}, score(scoreValue)) : null),
    roleName ? h('span', { class: 'ai-phase-role' }, roleName) : null,
    key ? h('span', { class: 'ai-phase-inputs' }, `Key: ${key}`) : null,
    pref ? h('span', { class: 'ai-phase-inputs' }, `Preferred: ${pref}`) : null,
    fit?.score_incomplete ? h('span', { class: 'ai-phase-inputs' }, `Score incomplete: no value for ${(fit.missing_key_attributes || []).join(', ')}`) : null,
    explanation ? h('span', { class: 'ai-text' }, explanation) : null);
}

/** The role's SquadLab score and its Key / Preferred values at a position, from the request. */
function roleAt(payload, position, ph, roleName) {
  const pos = payload.positions.find((x) => x.position === position);
  const r = pos?.best_roles?.[ph]?.find((x) => x.name === roleName);
  if (r) return { score: r.squadlab_role_score_out_of_100, fit: r };
  const a = (payload.lineup_assignments || []).find((x) => x.position === position && x.role_fit?.[ph]?.role === roleName);
  return a ? { score: a.role_fit[ph].squadlab_role_score_out_of_100, fit: a.role_fit[ph] } : { score: undefined, fit: null };
}

export function developmentView(report, payload) {
  const bp = report.best_position;
  const places = payload.lineup_assignments || [];
  return h('div', { class: 'ai-report' },
    h('section', { class: 'ai-verdict', 'aria-label': 'Development Report' },
      h('p', { class: 'ai-kicker' }, 'Development Report'),
      h('p', { class: 'ai-headline ai-headline-lg' }, report.takeaway)),
    sec('Best Position',
      h('p', { class: 'ai-pick ai-pick-sm' }, bp.position,
        h('span', { class: 'ai-pick-note' }, bp.familiarity !== null && bp.familiarity !== undefined ? `Familiarity ${bp.familiarity}` : null),
        bp.needs_retraining ? h('span', { class: 'ai-tag' }, 'Needs retraining') : null),
      h('p', { class: 'ai-text' }, bp.explanation),
      PHASES.some((ph) => bp[ph]) ? h('ul', { class: 'ai-phases' }, PHASES.filter((ph) => bp[ph]).map((ph) =>
        { const at = roleAt(payload, bp.position, ph, bp[ph].role); return phaseCard(ph, bp[ph].role, at.score, bp[ph].explanation, at.fit); })) : null,
      bp.alternative ? h('p', { class: 'ai-text ai-alt' }, h('b', {}, 'Alternative: '), bp.alternative) : null),
    sec('Fit in Your Lineups',
      places.length
        ? h('ul', { class: 'ai-jobs' }, places.map((a) => h('li', { class: `ai-job${a.primary ? ' primary' : ''}` },
          h('span', { class: 'ai-job-head' }, `${a.lineup} · ${a.slot}`, h('span', {}, a.position)),
          h('span', { class: 'ai-job-roles' }, PHASES.map((ph) => h('span', {}, `${PHASE_LABEL[ph]}: `, a.role_fit?.[ph] ? h('b', {}, a.role_fit[ph].role) : h('i', {}, 'Not set')))))))
        : h('p', { class: 'ai-text ai-muted' }, 'Not in First, Backup or Future XI'),
      h('p', { class: 'ai-text' }, report.lineup_fit),
      report.suggested_roles ? h('div', { class: 'ai-suggest' }, PHASES.filter((ph) => report.suggested_roles[ph]).map((ph) => {
        const x = report.suggested_roles[ph];
        return h('div', { class: 'ai-suggest-item' },
          h('p', { class: 'ai-suggest-head' }, h('span', { class: 'ai-tag ai-tag-first' }, 'Suggestion'), `${PHASE_LABEL[ph]}: ${x.role}`, h('span', { class: 'ai-pick-note' }, `${x.lineup} · ${x.slot}, not set`)),
          h('p', { class: 'ai-text' }, x.explanation));
      })) : null,
      !places.length && report.suggested_slot ? h('div', { class: 'ai-suggest' },
        h('p', { class: 'ai-suggest-head' }, h('span', { class: 'ai-tag ai-tag-first' }, 'Recommendation'), `${report.suggested_slot.lineup} · ${report.suggested_slot.slot}`,
          report.suggested_slot.position ? h('span', { class: 'ai-pick-note' }, report.suggested_slot.position) : null),
        h('p', { class: 'ai-text' }, report.suggested_slot.explanation)) : null),
    sec('Development Priorities',
      h('ol', { class: 'ai-priorities' }, report.priorities.map((x) => h('li', { class: 'ai-priority' },
        h('span', { class: 'ai-priority-head' }, x.attribute, h('b', {}, String(x.current))),
        x.history ? h('span', { class: `ai-priority-hist ${x.history.to > x.history.from ? 'd-good' : 'd-bad'}` },`${x.history.from} → ${x.history.to} since ${formatGameDate(x.history.from_date)}`) : null,
        h('span', { class: 'ai-text' }, x.why))))),
    report.outlook ? sec('Outlook', h('p', { class: 'ai-text' }, report.outlook)) : null);
}

export function recruitmentView(report, payload) {
  const bf = report.best_fit;
  const fit = (payload.squad_fit || []).find((s) => s.slot === bf.slot) || null;
  const clubPlayer = (name) => fit?.club_players.find((c) => c.name === name) || (payload.squad_fit || []).flatMap((s) => s.club_players).find((c) => c.name === name);
  const ask = payload.player.asking_price;
  const askText = ask.status === 'available' ? shortMoney(ask.amount) : 'Unknown';
  return h('div', { class: 'ai-report' },
    h('section', { class: 'ai-verdict', 'aria-label': 'Recruitment Report' },
      h('p', { class: 'ai-kicker' }, 'Recruitment Report'),
      h('p', { class: 'ai-pick' }, verdictText(report.verdict)),
      h('p', { class: 'ai-headline' }, report.headline),
      h('p', { class: 'ai-text' }, report.explanation)),
    sec('Best Fit',
      h('p', { class: 'ai-pick ai-pick-sm' }, bf.slot || bf.position, h('span', { class: 'ai-pick-note' }, bf.slot ? bf.position : null),
        fit && (fit.his_familiarity ?? 0) < 15 ? h('span', { class: 'ai-tag' }, 'Needs retraining') : null),
      h('p', { class: 'ai-text' }, bf.explanation),
      PHASES.some((ph) => bf[ph] || fit?.his_role_fit?.[ph]) ? h('ul', { class: 'ai-phases' }, PHASES.filter((ph) => bf[ph] || fit?.his_role_fit?.[ph]).map((ph) => {
        const f = fit?.his_role_fit?.[ph];
        const saved = !!fit?.saved_roles?.[ph];
        const roleName = f ? (saved ? f.role : `${f.role} · general fit, role not set`) : null;
        return phaseCard(ph, roleName, f ? f.squadlab_role_score_out_of_100 : undefined, bf[ph] || null, f || null);
      })) : null),
    report.competition.length ? sec('Competition',
      h('ul', { class: 'ai-phases' }, report.competition.map((c) => {
        const cp = clubPlayer(c.name);
        return h('li', { class: 'ai-phase' },
          h('span', { class: 'ai-phase-head' }, c.name, cp?.lineup_places?.length ? h('b', {}, cp.lineup_places[0]) : null),
          h('span', { class: 'ai-text' }, c.comparison));
      }))) : null,
    sec('Price',
      h('dl', { class: 'ai-price' },
        h('dt', {}, 'Asking price'), h('dd', {}, askText),
        h('dt', {}, 'Advice'), h('dd', {}, adviceText(report.price, payload))),
      h('p', { class: 'ai-text' }, report.price.explanation)),
    sec('Evidence', h('ol', { class: 'ai-evidence' }, report.evidence.map((e) => h('li', {}, e)))));
}

export const playerReportView = (report, payload) => (report.report_type === 'development' ? developmentView(report, payload) : recruitmentView(report, payload));
