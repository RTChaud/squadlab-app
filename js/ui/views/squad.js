// Squad screen: one dropdown (First Team, Reserve Team, Youth Team, Out on
// Loan, All — in that fixed order) and the selected group's players, using the
// same player list as the shortlists.
// Route: #/squad (First Team) or #/squad/<first|reserve|youth|loan|all>

import { h, icon } from '../dom.js';
import { getModel } from '../../store.js';
import { resolveTeams } from '../../data/snapshot.js';
import { PlayerList } from '../components/playerList.js';

function issueBox(issues) {
  return h('div', { class: 'issue', role: 'alert' },
    icon('alert', 'issue-icon'),
    h('div', {},
      h('p', { class: 'issue-title' }, 'Squad data problem in this snapshot'),
      h('ul', { class: 'issue-list' }, issues.map((i) => h('li', {}, i))),
      h('p', { class: 'issue-note' }, 'Nothing has been guessed. Re-export the snapshot from the extractor, or check its squads section.'),
    ),
  );
}

export function SquadView({ slotKey } = {}) {
  const model = getModel();
  const teams = resolveTeams(model); // already in TEAM_SLOTS order
  // "All": everyone in the four groups above, once each.
  const seen = new Set();
  const everyone = teams.flatMap((x) => x.players).filter((p) => (seen.has(p.uid) ? false : seen.add(p.uid)));
  const allIssues = teams.filter((x) => x.issues.length).map((x) => `${x.label}: ${x.issues.join(' ')}`);
  const groups = [...teams, { key: 'all', label: 'All', players: everyone, issues: allIssues, fatal: false }];
  const key = groups.some((x) => x.key === slotKey) ? slotKey : 'first';
  const t = groups.find((x) => x.key === key);

  const select = h('select', {
    class: 'select', id: 'squad-select', 'aria-label': 'Squad',
    // replace so Back returns to Home rather than stepping through each squad
    onchange: (e) => location.replace(`#/squad/${e.target.value}`),
  },
    groups.map((x) => h('option', { value: x.key, selected: x.key === key },
      `${x.label} (${x.fatal ? '—' : x.players.length})`)),
  );

  return {
    title: 'Squad',
    back: '#/',
    body: h('div', { class: 'stack' },
      h('div', { class: 'field' },
        h('label', { class: 'field-label', for: 'squad-select' }, 'Squad'),
        select,
      ),
      t.issues.length ? issueBox(t.issues) : null,
      t.fatal ? null : PlayerList(t.players, { emptyTitle: 'No players in this squad', from: `/squad/${t.key}`, lineupSlots: true }),
    ),
  };
}
