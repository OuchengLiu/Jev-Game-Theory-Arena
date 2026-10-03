// Jev Game Theory Lab · © the Jev Game Theory Lab authors · see LICENSE · canary GUID JGTL-CANARY-7c006748-fdca-49c4-ba68-4f6b9bd0cd16
// Anonymous gameplay data: POST /log (store) and GET /stats (public aggregates).
// Storage: Cloudflare D1 (binding DB, schema in ../migrations). Both are no-ops without DB.

import { checkBatch } from '../../shared/telemetry.js';
import { MODEL_STATUS } from './models.js';
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
  if(batch.e.every(e=>e.ex==='2')) return logExperiment(batch,env,day,json);
  if(batch.e.some(e=>e.ex==='2')) return json(400,{error:'bad_request'});
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
  const cacheKey = new Request('https://stats.cache/v7');
  const hit = cache && await cache.match(cacheKey);
  let body = hit ? await hit.text() : null;
  if (!body) {
    const { results } = await env.DB.prepare(
      'SELECT game, game_ver, mode, policy, actor, model, kind, phase, act, detail, n FROM agg WHERE n > 0').all();
    const modern=await env.DB.prepare('SELECT * FROM agg_v2 WHERE n>0').all();
    const matches=await env.DB.prepare('SELECT game,opponent,mode,variant,policy,assignment_source,mixed,COUNT(*) n,SUM(result =  CHAR(119,105,110)) human_wins,SUM(result = CHAR(100,114,97,119)) draws,AVG(human_score) human_score,AVG(opponent_score) opponent_score FROM experiment_matches WHERE experiment = ? GROUP BY game,opponent,mode,variant,policy,assignment_source,mixed').bind('2').all();
    // Aggregate completed, automatically assigned v2 matches only. No player IDs leave the Worker.
    // The first end event supplies version/player metadata; repeated end events cannot multiply counts.
    const comparisons=await env.DB.prepare(`WITH first_end AS (
      SELECT match_id,MIN(id) id FROM events WHERE experiment='2' AND kind='end' GROUP BY match_id
    ), model_per_match AS (
      SELECT match_id,MIN(model) model,COUNT(DISTINCT model) model_count FROM events
      WHERE experiment='2' AND actor='jev' AND model<>'' GROUP BY match_id
    ) SELECT m.game,e.game_ver,m.mode,m.variant,m.policy,mm.model,
      COUNT(*) n,COUNT(DISTINCT e.player_id) players,
      SUM(e.player_id IS NULL) unidentified_matches,
      SUM(m.result='lose') model_wins,SUM(m.result='win') human_wins,SUM(m.result='draw') draws,
      AVG(m.human_score) human_score,AVG(m.opponent_score) opponent_score,
      COUNT(m.human_score) human_score_n,COUNT(m.opponent_score) opponent_score_n
    FROM experiment_matches m JOIN first_end f ON f.match_id=m.match_id JOIN events e ON e.id=f.id
    JOIN model_per_match mm ON mm.match_id=m.match_id AND mm.model_count=1
    WHERE m.experiment='2' AND m.mixed=0 AND m.assignment_source='adaptive' AND m.opponent='jev'
      AND m.mode IN ('raw','hinted')
    GROUP BY m.game,e.game_ver,m.mode,m.variant,m.policy,mm.model`).all();
    body = JSON.stringify({
      experiment:'2', models:MODEL_STATUS, modern:modern.results, matches:matches.results, comparisons:comparisons.results,
      enabled: true,
      terms: TERMS,
      updated: new Date().toISOString(),
      cols: ['game', 'game_ver', 'mode', 'policy', 'actor', 'model', 'kind', 'phase', 'act', 'detail', 'n'],
      rows: results.map((r) => [r.game, r.game_ver, r.mode, r.policy, r.actor, r.model, r.kind, r.phase, r.act, r.detail, r.n]),
    });
    if (cache) ctx.waitUntil(cache.put(cacheKey, new Response(body, { headers: { 'Cache-Control': `max-age=${STATS_TTL_S}` } })));
  }
  return new Response(body, { headers });
}

async function logExperiment(batch,env,day,json) {
  const unseen='NOT EXISTS (SELECT 1 FROM log_batches WHERE batch_id = ?)';
  const stmts=[];
  for(let i=0;i<batch.e.length;i++) {
    const e=batch.e[i], probs=e.pr || e.nl ? JSON.stringify({pr:e.pr,nl:e.nl}):null;
    const values=[day,batch.s,batch.p || null,batch.r?1:0,batch.l,batch.av,e.g,e.gv,e.m,e.pol || '',e.k,e.a || '',e.mdl || '',e.ph || '',e.act,e.x || '',probs,e.ex,e.v,e.opp,e.as,batch.aid || null,batch.b,i,e.hs ?? null,e.os ?? null];
    stmts.push(env.DB.prepare(`INSERT INTO events (day,match_id,player_id,research,lang,app_ver,game,game_ver,mode,policy,kind,actor,model,phase,act,detail,probs,experiment,variant,opponent,assignment_source,assignment_id,batch_id,batch_seq,human_score,opponent_score) SELECT ${values.map(()=>'?').join(',')} WHERE ${unseen}`).bind(...values,batch.b));
    const columns=['experiment','game','game_ver','variant','opponent','assignment_source','mode','policy','actor','model','kind','phase','act','detail'];
    const dims=[e.ex,e.g,e.gv,e.v,e.opp,e.as,e.m,e.pol || '',e.a || '',e.mdl || '',e.k,e.ph || '',e.act,e.mix ? 'mixed' : e.x || ''];
    stmts.push(env.DB.prepare(`INSERT INTO agg_v2 (${columns.join(',')},n) SELECT ${dims.map(()=>'?').join(',')},1 WHERE ${unseen} ON CONFLICT (${columns.join(',')}) DO UPDATE SET n=n+1`).bind(...dims,batch.b));
    if(e.k==='end') stmts.push(env.DB.prepare(`INSERT OR IGNORE INTO experiment_matches (match_id,experiment,game,opponent,mode,variant,policy,assignment_source,mixed,assignment_id,result,human_score,opponent_score,day) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${unseen}`).bind(batch.s,e.ex,e.g,e.opp,e.m,e.v,e.pol || '',e.as,e.mix?1:0,batch.aid || null,e.act,e.hs ?? null,e.os ?? null,day,batch.b));
  }
  stmts.push(env.DB.prepare('INSERT OR IGNORE INTO log_batches(batch_id) VALUES(?)').bind(batch.b));
  try {await env.DB.batch(stmts);return json(200,{ok:true});}
  catch(e) {console.log('experiment write failed',e.message);return json(503,{error:'unavailable',retryAfter:60});}
}
