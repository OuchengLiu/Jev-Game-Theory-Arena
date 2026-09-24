// Jev Game Theory Lab — Cloudflare Worker proxy.
//
// The browser never sees the TypeSafe API key. This Worker:
//   1. only answers POST /decide (and POST /session when Turnstile is enabled)
//   2. only accepts requests whose Origin is in ALLOWED_ORIGINS
//   3. validates { game, payload } against strict per-game schemas and builds the
//      Jev prompt itself (shared/prompts.js), so it cannot be used as a generic Jev proxy
//   4. rate-limits per IP (Cloudflare Rate Limiting binding) and caps total daily calls (KV)
//   5. optionally requires a Cloudflare Turnstile check, exchanged for a short-lived signed session
//   6. returns only { model, answers }

import { buildJevRequest, SchemaError } from '../../shared/prompts.js';

const TYPESAFE_URL = 'https://api.typesafe.ai/v1/systemone';
const MAX_BODY_BYTES = 8 * 1024;
const SESSION_TTL_S = 30 * 60;

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const originOk = allowed.includes(origin);
    const cors = originOk ? {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Session',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    } : { Vary: 'Origin' };
    const json = (status, body) => new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors },
    });

    if (request.method === 'OPTIONS') return new Response(null, { status: originOk ? 204 : 403, headers: cors });
    if (!originOk) return json(403, { error: 'origin not allowed' });
    if (request.method !== 'POST') return json(405, { error: 'method not allowed' });

    const url = new URL(request.url);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    // ---- per-IP rate limit ----
    if (env.RATE_LIMITER) {
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) return json(429, { error: 'rate limited' });
    }

    let body;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY_BYTES) return json(413, { error: 'payload too large' });
      body = JSON.parse(text);
    } catch {
      return json(400, { error: 'invalid json' });
    }

    // ---- Turnstile → session exchange ----
    if (url.pathname === '/session') {
      if (!env.TURNSTILE_SECRET) return json(404, { error: 'not enabled' });
      const ok = await verifyTurnstile(env.TURNSTILE_SECRET, body?.token, ip);
      if (!ok) return json(403, { error: 'human check failed' });
      const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_S;
      return json(200, { session: await sign(env.SESSION_SECRET, `${exp}`), exp });
    }

    if (url.pathname !== '/decide') return json(404, { error: 'not found' });

    if (env.TURNSTILE_SECRET) {
      const ok = await verifySession(env.SESSION_SECRET, request.headers.get('X-Session'));
      if (!ok) return json(401, { error: 'session required' });
    }

    // ---- validate + build prompt server-side ----
    let jevRequest;
    try {
      if (typeof body?.game !== 'string') throw new SchemaError('game missing');
      jevRequest = buildJevRequest(body.game, body.payload);
    } catch (e) {
      return json(400, { error: e instanceof SchemaError ? e.message : 'bad request' });
    }

    // ---- global daily budget ----
    if (env.USAGE) {
      const day = new Date().toISOString().slice(0, 10);
      const key = `calls:${day}`;
      const used = Number(await env.USAGE.get(key)) || 0;
      if (used >= Number(env.DAILY_LIMIT || 20000)) return json(429, { error: 'daily budget exhausted' });
      ctx.waitUntil(env.USAGE.put(key, String(used + 1), { expirationTtl: 60 * 60 * 48 }));
    }

    // ---- call Jev ----
    try {
      const res = await fetch(TYPESAFE_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.TYPESAFE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(jevRequest),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        console.log('upstream error', res.status, await res.text().catch(() => ''));
        return json(res.status === 429 ? 429 : 502, { error: 'upstream error' });
      }
      const data = await res.json();
      return json(200, { model: data.model, answers: data.answers });
    } catch (e) {
      console.log('upstream failure', e?.message);
      return json(504, { error: 'upstream timeout' });
    }
  },
};

// ---------------- helpers ----------------

async function verifyTurnstile(secret, token, ip) {
  if (typeof token !== 'string' || token.length > 4096) return false;
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  form.append('remoteip', ip);
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
