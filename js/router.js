// Hash-based routing: works on GitHub Pages sub-paths with no server config,
// and the browser/iOS back gesture works naturally.
//
// Routes may carry a query, e.g. #/player/123?from=%2Fsquad%2Freserve, which
// is how a profile knows which list to go back to.
// Future routes (compare, XI planner) slot in here.

const ROUTES = [
  { pattern: /^\/?$/, name: 'home' },
  { pattern: /^\/squad\/?$/, name: 'squadTeam' },
  { pattern: /^\/squad\/(first|reserve|youth|loan)\/?$/, name: 'squadTeam', keys: ['slotKey'] },
  { pattern: /^\/shortlists\/?$/, name: 'shortlists' },
  { pattern: /^\/shortlists\/(.+)$/, name: 'shortlists', keys: ['listId'] },
  { pattern: /^\/lineups\/?$/, name: 'lineups' },
  { pattern: /^\/lineups\/([^/]+)\/pick\/([A-Z]+)\/?$/, name: 'lineupPick', keys: ['id', 'slot'] },
  { pattern: /^\/lineups\/([^/]+)\/?$/, name: 'lineup', keys: ['id'] },
  { pattern: /^\/tags\/?$/, name: 'tags' },
  { pattern: /^\/tags\/(.+)$/, name: 'tags', keys: ['tagId'] },
  { pattern: /^\/player\/([^/]+)\/development\/?$/, name: 'development', keys: ['pid'] },
  { pattern: /^\/player\/([^/]+)\/?$/, name: 'player', keys: ['pid'] },
];

export function currentRoute() {
  const full = (location.hash || '#/').slice(1);
  const qi = full.indexOf('?');
  const path = qi === -1 ? full : full.slice(0, qi);
  const query = new URLSearchParams(qi === -1 ? '' : full.slice(qi + 1));
  for (const r of ROUTES) {
    const m = r.pattern.exec(path);
    if (m) {
      const params = {};
      (r.keys || []).forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { name: r.name, params, query, path, full };
    }
  }
  return { name: 'notFound', params: {}, query, path, full };
}

/** Build a hash link carrying where the user came from. */
export function linkWithFrom(path, from) {
  return from ? `#${path}?from=${encodeURIComponent(from)}` : `#${path}`;
}

/** A safe in-app back target from a ?from= value. */
export function backTarget(query, fallback) {
  const from = query.get('from');
  return from && from.startsWith('/') ? `#${from}` : fallback;
}

export function onRouteChange(fn) {
  window.addEventListener('hashchange', fn);
}
