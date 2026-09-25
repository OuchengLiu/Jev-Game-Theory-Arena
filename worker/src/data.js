// Jev Game Theory Lab · © the Jev Game Theory Lab authors · see LICENSE · canary GUID JGTL-CANARY-7c006748-fdca-49c4-ba68-4f6b9bd0cd16
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
    'INSERT INTO events (day, match_id, player_id, research, lang, app_ver, game, game_ver, mode, policy, kind, actor, model, phase, act, detail, probs) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const bump = env.DB.prepare(
    'INSERT INTO agg (game, game_ver, mode, policy, actor, model, kind, phase, act, detail, n) VALUES (?,?,?,?,?,?,?,?,?,?,?) ' +
    'ON CONFLICT (game, game_ver, mode, policy, actor, model, kind, phase, act, detail) DO UPDATE SET n = n + excluded.n');

  const counts = new Map();
  const stmts = batch.e.map((e) => {
    const key = [e.g, e.gv, e.m, e.pol || '', e.a || '', e.mdl || '', e.k, e.ph || '', e.act, e.x || ''];
    const k = key.join('|');
    counts.set(k, { key, n: (counts.get(k)?.n || 0) + 1 });
    const probs = e.pr || e.nl ? JSON.stringify({ ...(e.pr ? { pr: e.pr } : {}), ...(e.nl ? { nl: e.nl } : {}) }) : null;
    return insert.bind(day, batch.s, batch.p ?? null, batch.r ? 1 : 0, batch.l, batch.av, e.g, e.gv, e.m, e.pol ?? null, e.k, e.a ?? null, e.mdl ?? null, e.ph ?? null, e.act, e.x ?? null, probs);
  });
  for (const { key, n } of counts.values()) stmts.push(bump.bind(...key, n));
  if (batch.p) {
    const matches = batch.e.filter((e) => e.k === 'end').length;
    const moves = batch.e.filter((e) => e.k === 'move' && e.a === 'human').length;
    stmts.push(env.DB.prepare(
      'INSERT INTO players (player_id, first_day, last_day, days, matches, moves) VALUES (?,?,?,1,?,?) ' +
      'ON CONFLICT (player_id) DO UPDATE SET days = days + (CASE WHEN last_day <> excluded.last_day THEN 1 ELSE 0 END), ' +
      'last_day = excluded.last_day, matches = matches + excluded.matches, moves = moves + excluded.moves').bind(batch.p, day, day, matches, moves));
  }
  try {
    await env.DB.batch(stmts);
  } catch (e) {
    console.log('d1 write failed', e?.message);
    return json(503, { error: 'unavailable', retryAfter: 60 });
  }
  return json(200, { ok: true });
}

const TERMS = 'All rights reserved by the Jev Game Theory Lab authors. Viewing is welcome; copying, scraping, redistributing, re-analysing or using these statistics in research or publications requires prior written permission. See https://github.com/OuchengLiu/Jev-Game-Theory-Arena/blob/main/LICENSE';

export async function getStats(env, ctx, cors, ipRaw) {
  const headers = {
    'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${STATS_TTL_S}`,
    'X-Robots-Tag': 'noindex, noarchive', 'X-Data-License': 'All rights reserved; see terms', ...cors,
  };
  // generous per-visitor limit: the page itself fetches once per view and the data is cached 5 min
  if (env.LOG_LIMITER && ipRaw) {
    const { success } = await env.LOG_LIMITER.limit({ key: `stats:${ipRaw}` });
    if (!success) return new Response(JSON.stringify({ error: 'burst', retryAfter: 60 }), { status: 429, headers: { ...headers, 'Cache-Control': 'no-store' } });
  }
  if (!env.DB) return new Response(JSON.stringify({ enabled: false, terms: TERMS }), { headers });
  const cache = globalThis.caches?.default;
  const cacheKey = new Request('https://stats.cache/v4');
  const hit = cache && await cache.match(cacheKey);
  let body = hit ? await hit.text() : null;
  if (!body) {
    const { results } = await env.DB.prepare(
      'SELECT game, game_ver, mode, policy, actor, model, kind, phase, act, detail, n FROM agg WHERE n > 0').all();
    // players summary (small table); absent before the players migration has been applied
    let players = null;
    try {
      const row = await env.DB.prepare(
        "SELECT COUNT(*) AS total, SUM(CASE WHEN days >= 2 THEN 1 ELSE 0 END) AS back_players, " +
        "SUM(CASE WHEN matches = 0 THEN 1 ELSE 0 END) AS m0, SUM(CASE WHEN matches = 1 THEN 1 ELSE 0 END) AS m1, " +
        "SUM(CASE WHEN matches = 2 THEN 1 ELSE 0 END) AS m2, SUM(CASE WHEN matches BETWEEN 3 AND 5 THEN 1 ELSE 0 END) AS m3_5, " +
        "SUM(CASE WHEN matches BETWEEN 6 AND 10 THEN 1 ELSE 0 END) AS m6_10, SUM(CASE WHEN matches > 10 THEN 1 ELSE 0 END) AS m11 " +
        'FROM players WHERE moves > 0').first();
      if (row) players = { total: row.total || 0, returning: row.back_players || 0,
        matches: { '0': row.m0 || 0, '1': row.m1 || 0, '2': row.m2 || 0, '3-5': row.m3_5 || 0, '6-10': row.m6_10 || 0, '11+': row.m11 || 0 } };
    } catch { /* players table not created yet */ }
    body = JSON.stringify({
      enabled: true,
      terms: TERMS,
      players,
      updated: new Date().toISOString(),
      cols: ['game', 'game_ver', 'mode', 'policy', 'actor', 'model', 'kind', 'phase', 'act', 'detail', 'n'],
      rows: results.map((r) => [r.game, r.game_ver, r.mode, r.policy, r.actor, r.model, r.kind, r.phase, r.act, r.detail, r.n]),
    });
    if (cache) ctx.waitUntil(cache.put(cacheKey, new Response(body, { headers: { 'Cache-Control': `max-age=${STATS_TTL_S}` } })));
  }
  return new Response(body, { headers });
}
