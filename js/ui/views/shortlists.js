import { h } from '../dom.js';
import { getModel, getLastShortlist, setLastShortlist } from '../../store.js';
import { PlayerBrowser } from '../components/playerBrowser.js';

/**
 * One dropdown populated from the extract's shortlists; the selected list
 * renders with the same PlayerBrowser (search, filters, views) the squads use.
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

  const lists = [...model.visibleShortlists].sort((a, b) => a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base', numeric: true }));
  const visible = (id) => model.visibleShortlists.find((l) => l.id === id) || null;
  let current = listId ? visible(listId) : null;
  if (!current) {
    const last = await getLastShortlist();
    current = (last && visible(last)) || lists[0];
  }
  setLastShortlist(current.id);

  const select = h('select', {
    class: 'select', id: 'shortlist-select', 'aria-label': 'Shortlist',
    onchange: (e) => {
      // replace so Back returns to Home rather than stepping through each list
      location.replace(`#/shortlists/${encodeURIComponent(e.target.value)}`);
    },
  },
    lists.map((l) =>
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
      await PlayerBrowser({
        section: 'shortlists', source: current.id, sourceName: `“${current.name}”`, players,
        from: `/shortlists/${encodeURIComponent(current.id)}`,
        emptyTitle: 'This shortlist is empty',
        emptyText: `“${current.name}” has no players in this extract.`,
      }),
    ),
  };
}
