import { h } from '../dom.js';
import { getModel, getLastShortlist, setLastShortlist } from '../../store.js';
import { PlayerList } from '../components/playerList.js';

/**
 * One dropdown populated from the extract's shortlists; the selected list
 * renders with the same PlayerList component the squads use.
 * Route: #/shortlists or #/shortlists/<encoded id>
 */
export async function ShortlistsView({ listId }) {
  const model = getModel();

  if (model.visibleShortlists.length === 0) {
    return {
      title: 'Shortlists',
      back: '#/',
      body: h('div', { class: 'empty' },
        h('p', { class: 'empty-title' }, 'No shortlists in this extract'),
      ),
    };
  }

  const visible = (id) => model.visibleShortlists.find((l) => l.id === id) || null;
  let current = listId ? visible(listId) : null;
  if (!current) {
    const last = await getLastShortlist();
    current = (last && visible(last)) || model.visibleShortlists[0];
  }
  setLastShortlist(current.id);

  const select = h('select', {
    class: 'select', id: 'shortlist-select', 'aria-label': 'Shortlist',
    onchange: (e) => {
      // replace so Back returns to Home rather than stepping through each list
      location.replace(`#/shortlists/${encodeURIComponent(e.target.value)}`);
    },
  },
    model.visibleShortlists.map((l) =>
      h('option', { value: l.id, selected: l.id === current.id }, `${l.name} (${model.resolve(l.playerUids).length})`)),
  );

  const players = model.resolve(current.playerUids);

  return {
    title: 'Shortlists',
    back: '#/',
    body: h('div', { class: 'stack' },
      h('div', { class: 'field' },
        h('label', { class: 'field-label', for: 'shortlist-select' }, 'Shortlist'),
        select,
      ),
      PlayerList(players, {
        emptyTitle: 'This shortlist is empty',
        emptyText: `“${current.name}” has no players in this extract.`,
        from: `/shortlists/${encodeURIComponent(current.id)}`,
      }),
    ),
  };
}
