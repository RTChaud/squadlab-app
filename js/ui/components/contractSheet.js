// Contract sheet on the player profile: Contract (expiry + time remaining,
// monthly salary) and Transfer (asking price, release clauses), all from the
// profile's snapshot. Amounts are rounded up for display (money.js).

import { h, DASH } from '../dom.js';
import { openSheet } from './sheet.js';
import { contractDetails, UNAVAILABLE } from '../../data/contract.js';
import { formatGameDate } from '../../data/snapshot.js';

function row(label, value, o = {}) {
  return h('div', { class: `ct-row${o.cls ? ` ${o.cls}` : ''}`, 'data-row': o.id },
    h('dt', { class: 'ct-label' }, label, o.note ? h('span', { class: 'ct-note' }, o.note) : null),
    h('dd', { class: 'ct-value' }, value));
}

const valueText = (text) => {
  if (text === null) return h('span', { class: 'ct-main ct-none' }, DASH);
  return h('span', { class: `ct-main${text === UNAVAILABLE ? ' ct-unavail' : ''}` }, text);
};

const STATUS = { active: 'Active', inactive: 'Inactive', unknown: 'Status unknown' };

/**
 * @param p player record, @param gameDate snapshot date, @param o { name, current }
 */
export function openContractSheet(p, gameDate, o = {}) {
  const d = contractDetails(p, gameDate);
  const r = d.transfer.relegation;
  const relegationValue = r.state === 'none'
    ? valueText(null)
    : [h('span', { class: `ct-main${r.state === 'unavailable' ? ' ct-unavail' : ''}${r.status === 'inactive' ? ' ct-inactive' : ''}` }, r.text),
      h('span', { class: `ct-status ${r.status}` }, STATUS[r.status])];

  openSheet({
    title: o.name || 'Contract',
    titleClass: 'sheet-title-sm',
    content: [
      h('p', { class: 'muted small ct-asof' }, o.current === false ? `Last recorded ${formatGameDate(gameDate)}` : `As of ${formatGameDate(gameDate)}`),
      h('p', { class: 'sheet-sub' }, 'Contract'),
      h('dl', { class: 'ct-list' },
        row('Contract expiry', [
          valueText(d.contract.end ? formatGameDate(d.contract.end) : UNAVAILABLE),
          d.contract.remaining ? h('span', { class: 'ct-sub' }, d.contract.remaining) : null,
        ], { id: 'expiry' }),
        row('Monthly salary', valueText(d.contract.monthlyText), { id: 'salary' })),
      h('p', { class: 'sheet-sub' }, 'Transfer'),
      h('dl', { class: 'ct-list' },
        row('Asking price', valueText(d.transfer.asking), { id: 'asking' }),
        row('Release clause', valueText(d.transfer.release.text), { id: 'release' }),
        row('Foreign-club release clause', valueText(d.transfer.foreign.text), { id: 'foreign', note: 'Foreign clubs only' }),
        row('Champions League clubs release clause', valueText(d.transfer.champions.text), { id: 'champions' }),
        row('Relegation release clause', relegationValue, { id: 'relegation' })),
    ],
    actions: [{ label: 'Close', kind: 'secondary', onClick: (close) => close() }],
  });
}
