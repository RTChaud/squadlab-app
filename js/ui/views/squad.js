// Squad screen: one dropdown (First Team, Reserve Team, Youth Team, Out on
// Loan — in that fixed order) and the selected group's players, using the
// same player list as the shortlists.
// Route: #/squad (First Team) or #/squad/<first|reserve|youth|loan>

import { h, icon } from '../dom.js';
import { getModel } from '../../store.js';
import { resolveTeams, TEAM_SLOTS } from '../../data/snapshot.js';
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
  const key = TEAM_SLOTS.some((s) => s.key === slotKey) ? slotKey : 'first';
  const teams = resolveTeams(model); // already in TEAM_SLOTS order
  const t = teams.find((x) => x.key === key);

  const select = h('select', {
    class: 'select', id: 'squad-select', 'aria-label': 'Squad',
    // replace so Back returns to Home rather than stepping through each squad
    onchange: (e) => location.replace(`#/squad/${e.target.value}`),
  },
    teams.map((x) => h('option', { value: x.key, selected: x.key === key },
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
