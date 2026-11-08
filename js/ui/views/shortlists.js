import { h } from '../dom.js';
import { getModel, getLastShortlist, setLastShortlist } from '../../store.js';
import { ALL_LIST_ID } from '../../data/snapshot.js';
import { backTarget } from '../../router.js';
import { PlayerBrowser } from '../components/playerBrowser.js';

/**
 * One dropdown: the built-in All view (every player in the latest snapshot,
 * once each), then the extract's shortlists. The selected list renders with the
 * same PlayerBrowser (search, filters, views) the squads use.
 * Route: #/shortlists or #/shortlists/<encoded id>, optionally ?from=<route>
 * (e.g. /tactic) so Back returns there.
 */
export async function ShortlistsView({ listId, query }) {
  const model = getModel();
  const from = query?.get('from') || null;
  const back = backTarget(query || new URLSearchParams(), '#/');

  const all = { id: ALL_LIST_ID, name: 'All', players: model.allPlayers };
  const imported = [...model.visibleShortlists]
    .sort((a, b) => a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base', numeric: true }))
    .map((l) => ({ id: l.id, name: l.name, players: model.resolve(l.playerUids) }));
  const lists = [all, ...imported];
  const byId = (id) => lists.find((l) => l.id === id) || null;

  let current = listId ? byId(listId) : null;
  if (!current) {
    const last = await getLastShortlist();
    current = (last && byId(last)) || all;
  }
  setLastShortlist(current.id);

  const suffix = from ? `?from=${encodeURIComponent(from)}` : '';
  const select = h('select', {
    class: 'select', id: 'shortlist-select', 'aria-label': 'Shortlist',
    onchange: (e) => {
      // replace so Back returns to where Shortlists was opened from, not each list
      location.replace(`#/shortlists/${encodeURIComponent(e.target.value)}${suffix}`);
    },
  }, lists.map((l) => h('option', { value: l.id, selected: l.id === current.id }, `${l.name} (${l.players.length})`)));

  const here = `/shortlists/${encodeURIComponent(current.id)}${suffix}`;
  return {
    title: 'Shortlists',
    back,
    body: h('div', { class: 'stack' },
      h('div', { class: 'field' },
        h('label', { class: 'field-label', for: 'shortlist-select' }, 'Shortlist'),
        select,
      ),
      await PlayerBrowser({
        section: 'shortlists', source: current.id, sourceName: current.id === ALL_LIST_ID ? 'all players' : `“${current.name}”`,
        players: current.players,
        from: here,
        emptyTitle: current.id === ALL_LIST_ID ? 'No players in this snapshot' : 'This shortlist is empty',
        emptyText: current.id === ALL_LIST_ID ? '' : `“${current.name}” has no players in this extract.`,
      }),
    ),
  };
}
