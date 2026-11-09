// Route for the AI Analysis endpoint, with its CORS handling. Add it to the
// Worker's existing fetch handler:
//
//   import { routeCompare } from './compareRoute.js';
//   ...
//   async fetch(request, env, ctx) {
//     const compared = await routeCompare(request, env);
//     if (compared) return compared;
//     ...existing routes...
//   }
//
// Secrets / variables:
//   ANTHROPIC_API_KEY  (secret)   provider key
//   ANTHROPIC_MODEL    (optional) model id, default in compare.js
//   ALLOWED_ORIGINS    (optional) comma-separated origins allowed to call it,
//                      e.g. https://yourname.github.io — unset allows any origin

import { handleCompare } from './compare.js';

export const COMPARE_PATH = '/compare';

function corsFor(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = !allowed.length || allowed.includes(origin);
  return {
    ok,
    headers: {
      'Access-Control-Allow-Origin': allowed.length ? (ok ? origin : 'null') : '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    },
  };
}

function withHeaders(res, headers) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  return out;
}

/** The /compare response, or null for any other path. */
export async function routeCompare(request, env) {
  if (new URL(request.url).pathname !== COMPARE_PATH) return null;
  const cors = corsFor(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: cors.ok ? 204 : 403, headers: cors.headers });
  if (!cors.ok) {
    return new Response(JSON.stringify({ ok: false, error: { code: 'forbidden', message: 'This origin is not allowed.' } }),
      { status: 403, headers: { 'content-type': 'application/json', ...cors.headers } });
  }
  return withHeaders(await handleCompare(request, env), cors.headers);
}
