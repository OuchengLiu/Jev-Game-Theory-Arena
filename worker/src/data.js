// Anonymous gameplay data: POST /log (store) and GET /stats (public aggregates).
// Storage: Cloudflare D1 (binding DB, schema in ../migrations). Both are no-ops without DB.

import { checkBatch } from '../../shared/telemetry.js';
import { SchemaError } from '../../shared/schema.js';

const MAX_LOG_BYTES = 64 * 1024;
const STATS_TTL_S = 300;

export async function logEvents(request, env, { ip, askGuard, json, refuse }) {
  if (env.LOG_LIMITER) {
    const { success } = await env.LOG_LIMITER.limit({ key: ip });
    if (!success) return json(429, { error: 'burst', retryAfter: 60 });
  }
  let batch;
  try {
    const text = await request.text();
    if (text.length > MAX_LOG_BYTES) throw new SchemaError('too large');
    batch = checkBatch(JSON.parse(text));
  } catch (e) {
    const v = await askGuard('invalid');
    if (!v.ok) return refuse(v);
    return json(400, { error: 'bad_request', detail: env.DEBUG === '1' && e instanceof SchemaError ? e.message : undefined });
  }
  if (!env.DB) return json(200, { ok: true, stored: false });

  const day = new Date().toISOString().slice(0, 10);
  const insert = env.DB.prepare(
    'INSERT INTO events (day, match_id, research, lang, app_ver, game, game_ver, mode, policy, kind, actor, model, phase, act, detail, probs) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const bump = env.DB.prepare(
    'INSERT INTO agg (game, game_ver, mode, policy, actor, model, kind, phase, act, detail, n) VALUES (?,?,?,?,?,?,?,?,?,?,?) ' +
    'ON CONFLICT (game, game_ver, mode, policy, actor, model, kind, phase, act, detail) DO UPDATE SET n = n + excluded.n');

  const counts = new Map();
  const stmts = batch.e.map((e) => {
    const key = [e.g, e.gv, e.m, e.pol || '', e.a || '', e.mdl || '', e.k, e.ph || '', e.act, e.x || ''];
    const k = key.join('|');
    counts.set(k, { key, n: (counts.get(k)?.n || 0) + 1 });
    const probs = e.pr || e.nl ? JSON.stringify({ ...(e.pr ? { pr: e.pr } : {}), ...(e.nl ? { nl: e.nl } : {}) }) : null;
    return insert.bind(day, batch.s, batch.r ? 1 : 0, batch.l, batch.av, e.g, e.gv, e.m, e.pol ?? null, e.k, e.a ?? null, e.mdl ?? null, e.ph ?? null, e.act, e.x ?? null, probs);
  });
  for (const { key, n } of counts.values()) stmts.push(bump.bind(...key, n));
  try {
    await env.DB.batch(stmts);
  } catch (e) {
    console.log('d1 write failed', e?.message);
    return json(503, { error: 'unavailable', retryAfter: 60 });
  }
  return json(200, { ok: true });
}

export async function getStats(env, ctx, cors) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${STATS_TTL_S}`, ...cors };
  if (!env.DB) return new Response(JSON.stringify({ enabled: false }), { headers });
  const cache = globalThis.caches?.default;
  const cacheKey = new Request('https://stats.cache/v2');
  const hit = cache && await cache.match(cacheKey);
  let body = hit ? await hit.text() : null;
  if (!body) {
    const { results } = await env.DB.prepare(
      'SELECT game, game_ver, mode, policy, actor, model, kind, phase, act, detail, n FROM agg WHERE n > 0').all();
    body = JSON.stringify({
      enabled: true,
      updated: new Date().toISOString(),
      cols: ['game', 'game_ver', 'mode', 'policy', 'actor', 'model', 'kind', 'phase', 'act', 'detail', 'n'],
      rows: results.map((r) => [r.game, r.game_ver, r.mode, r.policy, r.actor, r.model, r.kind, r.phase, r.act, r.detail, r.n]),
    });
    if (cache) ctx.waitUntil(cache.put(cacheKey, new Response(body, { headers: { 'Cache-Control': `max-age=${STATS_TTL_S}` } })));
  }
  return new Response(body, { headers });
}
