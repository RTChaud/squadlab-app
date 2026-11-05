// Hash-based routing: works on GitHub Pages sub-paths with no server config,
// and the browser/iOS back gesture works naturally.
//
// Future routes (player profile, compare, history, XI planner) slot in here.

const ROUTES = [
  { pattern: /^\/?$/, name: 'home' },
  { pattern: /^\/squad\/?$/, name: 'squad' },
  { pattern: /^\/squad\/setup\/?$/, name: 'squadSetup' },
  { pattern: /^\/squad\/(first|reserve|youth)\/?$/, name: 'squadTeam', keys: ['slotKey'] },
  { pattern: /^\/shortlists\/?$/, name: 'shortlists' },
  { pattern: /^\/shortlists\/(.+)$/, name: 'shortlists', keys: ['listId'] },
];

export function currentRoute() {
  const path = (location.hash || '#/').slice(1);
  for (const r of ROUTES) {
    const m = r.pattern.exec(path);
    if (m) {
      const params = {};
      (r.keys || []).forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { name: r.name, params, path };
    }
  }
  return { name: 'notFound', params: {}, path };
}

export function onRouteChange(fn) {
  window.addEventListener('hashchange', fn);
}
