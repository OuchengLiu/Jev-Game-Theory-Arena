// Jev Game Theory Lab — Cloudflare Worker proxy.
//
// The browser never sees the TypeSafe API key. This Worker:
//   1. only answers POST /decide (and POST /session when Turnstile is enabled)
//   2. only accepts requests whose Origin is in ALLOWED_ORIGINS
//   3. validates { game, mode, payload } against strict per-game schemas and builds the
//      Jev prompt itself (shared/prompts.js), so it cannot be used as a generic Jev proxy
//   4. limits bursts per visitor (Rate Limiting bindings), caps daily calls per visitor and
//      site-wide, and blocks visitors who keep sending invalid requests (Guard Durable Object)
//   5. optionally requires a Cloudflare Turnstile check, exchanged for a short-lived signed session
//   6. returns only { model, answers }
//   7. POST /log stores anonymous gameplay events in D1; GET /stats serves cached aggregates
//
// Jev is reached through the Workers AI binding (model typesafe/jev, billed to the Cloudflare
// account) or, if the TYPESAFE_API_KEY secret is set, through TypeSafe's own API.
//
// Every refusal is JSON: { error: <code>, retryAfter?: <seconds> } so the site can explain it.
//   burst · ip_daily · global_daily · blocked · not_configured · upstream_busy · unavailable
//   bad_request · session_required · forbidden

import { buildJevRequest, SchemaError } from '../../shared/prompts.js';
import { logEvents, getStats } from './data.js';
export { Guard } from './guard.js';

const TYPESAFE_URL = 'https://api.typesafe.ai/v1/systemone';
const WORKERS_AI_MODEL = 'typesafe/jev';
const MAX_BODY_BYTES = 8 * 1024;
const SESSION_TTL_S = 30 * 60;

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const originOk = allowed.includes(origin);
    const cors = originOk ? {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Session',
      'Access-Control-Expose-Headers': 'Retry-After',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    } : { Vary: 'Origin' };
    const json = (status, body) => new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...(body.retryAfter ? { 'Retry-After': String(body.retryAfter) } : {}),
        ...cors,
      },
    });

    if (request.method === 'OPTIONS') return new Response(null, { status: originOk ? 204 : 403, headers: cors });
    if (!originOk) return json(403, { error: 'forbidden' });

    const url = new URL(request.url);
    // public, cached aggregate statistics for the insights page
    if (request.method === 'GET' && url.pathname === '/stats') return getStats(env, ctx, cors);
    if (request.method !== 'POST') return json(405, { error: 'forbidden' });
    if (!['/decide', '/session', '/log'].includes(url.pathname)) return json(404, { error: 'forbidden' });

    const ip = await hashIp(request.headers.get('CF-Connecting-IP') || 'unknown');
    const guard = env.GUARD ? env.GUARD.get(env.GUARD.idFromName('global')) : null;
    const askGuard = async (op) => {
      if (!guard) return { ok: true };
      const r = await guard.fetch('https://guard/', { method: 'POST', body: JSON.stringify({ op, ip }) });
      return r.json();
    };
    const refuse = (verdict) => json(verdict.reason === 'blocked' ? 403 : 429, { error: verdict.reason, retryAfter: verdict.retryAfter });

    // anonymous gameplay events (separate, generous limit; never touches the Jev quota)
    if (url.pathname === '/log') return logEvents(request, env, { ip, askGuard, json, refuse });

    // ---- short bursts: 10-second and 1-minute windows per visitor ----
    for (const [limiter, period] of [[env.BURST_LIMITER, 10], [env.RATE_LIMITER, 60]]) {
      if (!limiter) continue;
      const { success } = await limiter.limit({ key: ip });
      if (!success) return json(429, { error: 'burst', retryAfter: period });
    }

    let body;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY_BYTES) throw new Error('too large');
      body = JSON.parse(text);
    } catch {
      const v = await askGuard('invalid');
      return v.ok ? json(400, { error: 'bad_request' }) : refuse(v);
    }

    // ---- Turnstile → session exchange ----
    if (url.pathname === '/session') {
      if (!env.TURNSTILE_SECRET) return json(404, { error: 'forbidden' });
      const ok = await verifyTurnstile(env.TURNSTILE_SECRET, body?.token, request.headers.get('CF-Connecting-IP'));
      if (!ok) return json(403, { error: 'session_required' });
      const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_S;
      return json(200, { session: await sign(env.SESSION_SECRET, `${exp}`), exp });
    }

    if (env.TURNSTILE_SECRET) {
      const ok = await verifySession(env.SESSION_SECRET, request.headers.get('X-Session'));
      if (!ok) return json(401, { error: 'session_required' });
    }

    // ---- validate + build prompt server-side (invalid requests count towards a block) ----
    let jevRequest;
    try {
      if (typeof body?.game !== 'string') throw new SchemaError('game missing');
      jevRequest = buildJevRequest(body.game, body.payload, body.mode ?? 'hinted');
    } catch (e) {
      const v = await askGuard('invalid');
      if (!v.ok) return refuse(v);
      return json(400, { error: 'bad_request', detail: e instanceof SchemaError ? e.message : undefined });
    }

    const provider = env.TYPESAFE_API_KEY ? 'typesafe' : env.AI ? 'workers-ai' : null;
    if (!provider) return json(503, { error: 'not_configured', retryAfter: 600 });

    // ---- daily quotas (per visitor and site-wide) + block list ----
    const verdict = await askGuard('consume');
    if (!verdict.ok) return refuse(verdict);

    // ---- call Jev: Cloudflare Workers AI (typesafe/jev) or TypeSafe's own API ----
    if (provider === 'workers-ai') {
      try {
        const run = env.AI.run(WORKERS_AI_MODEL, { state: jevRequest.state, questions: jevRequest.questions });
        const raw = await Promise.race([run, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout after 8s')), 8000))]);
        const out = unwrapAi(raw);
        if (!out?.answers) throw new Error(`unexpected response: ${JSON.stringify(raw)?.slice(0, 120)}`);
        return json(200, { model: out.model || WORKERS_AI_MODEL, answers: out.answers });
      } catch (e) {
        const msg = String(e?.message || e);
        console.log('workers-ai failure', msg);
        // capacity / rate errors → busy; everything else → unavailable
        // `detail` is a short provider message (never contains secrets) to make setup problems diagnosable
        const detail = msg.replace(/[^\x20-\x7e]/g, '').slice(0, 160);
        if (/credit|billing|payment|2021/i.test(msg)) return json(503, { error: 'not_configured', retryAfter: 600, detail });
        if (/capacity|rate|limit|429|3040|neuron/i.test(msg)) return json(503, { error: 'upstream_busy', retryAfter: 60, detail });
        return json(502, { error: 'unavailable', retryAfter: 30, detail });
      }
    }
    try {
      const res = await fetch(TYPESAFE_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.TYPESAFE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(jevRequest),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        console.log('upstream error', res.status, await res.text().catch(() => ''));
        if (res.status === 429) return json(503, { error: 'upstream_busy', retryAfter: 60 });
        if (res.status === 401 || res.status === 403) return json(503, { error: 'not_configured', retryAfter: 600 });
        return json(502, { error: 'unavailable', retryAfter: 30 });
      }
      const data = await res.json();
      return json(200, { model: data.model, answers: data.answers });
    } catch (e) {
      console.log('upstream failure', e?.message);
      return json(504, { error: 'unavailable', retryAfter: 30 });
    }
  },
};

// ---------------- helpers ----------------

// Workers AI may return the evaluation directly or wrapped ({ result: {...} } / { state, result }).
function unwrapAi(r) {
  let out = r;
  for (let i = 0; i < 3 && out && !out.answers && typeof out === 'object'; i++) out = out.result ?? out.response ?? null;
  return out;
}

// Visitors are tracked by a salted hash of their IP, never the raw address.
async function hashIp(ip) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(`jev-gtl:${ip}`));
  return b64url(digest).slice(0, 22);
}

async function verifyTurnstile(secret, token, ip) {
  if (typeof token !== 'string' || token.length > 4096) return false;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const out = await r.json().catch(() => ({}));
  return out.success === true;
}

const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(secret, msg) {
  if (!secret) throw new Error('SESSION_SECRET not configured');
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

async function sign(secret, exp) {
  return `${exp}.${await hmac(secret, exp)}`;
}

async function verifySession(secret, token) {
  if (typeof token !== 'string') return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const expected = await hmac(secret, exp);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
