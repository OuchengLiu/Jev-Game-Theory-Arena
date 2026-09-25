// Jev Game Theory Lab · © the Jev Game Theory Lab authors · see LICENSE · canary GUID JGTL-CANARY-7c006748-fdca-49c4-ba68-4f6b9bd0cd16
// The decision engine: asks Jev through the Worker proxy, and lets each game's practice
// bot play instead when the player chose Practice mode or Jev is limited / unreachable.
//
// Both paths return the same shape as the TypeSafe API:
//   { answers: { <id>: {type:'choice', choice, probabilities, confidence} | {type:'noul', noul} },
//     source: 'jev' | 'local', mode, model, ms, error? }
//
// When the proxy refuses (quota, burst, block, outage) we remember a cooldown and skip the
// network until it ends, so a limited player gets instant practice-bot moves plus a notice.

import { CONFIG } from './config.js';
import { settings, effectiveMode } from './settings.js';

async function postJson(url, body, headers = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONFIG.requestTimeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.code = data.error;
      err.retryAfter = Number(data.retryAfter || res.headers.get('Retry-After')) || 0;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function askJev(game, payload, mode) {
  const body = { game, mode, payload };
  if (!CONFIG.turnstileSiteKey) return postJson(CONFIG.proxyUrl, body);
  try {
    return await postJson(CONFIG.proxyUrl, body, { 'X-Session': await getSession() });
  } catch (e) {
    if (e.status !== 401) throw e;
    session = null; // expired: redo the human check once
    return postJson(CONFIG.proxyUrl, body, { 'X-Session': await getSession() });
  }
}

// ---------- limits & status ----------
// Codes shown to players (see i18n 'limit.*'): burst · ip_daily · global_daily · blocked ·
// busy (upstream overloaded or not configured) · offline (network / timeout / server error)
const DEFAULT_WAIT = { burst: 20, ip_daily: 3600, global_daily: 3600, blocked: 86400, busy: 120, offline: 30 };
let cooldown = null; // { code, until }
const statusListeners = new Set();

function classify(e) {
  switch (e.code) {
    case 'burst': case 'ip_daily': case 'global_daily': case 'blocked': return e.code;
    case 'upstream_busy': case 'not_configured': return 'busy';
    default: return 'offline'; // network errors, timeouts, 5xx, unexpected responses
  }
}

function startCooldown(code, seconds) {
  cooldown = { code, until: Date.now() + 1000 * (seconds || DEFAULT_WAIT[code]) };
  statusListeners.forEach((fn) => fn(getJevStatus()));
}

/** Current limit, if any: { code, until } (until = ms timestamp). */
export function getJevStatus() {
  if (cooldown && cooldown.until <= Date.now()) cooldown = null;
  return cooldown;
}

export function onJevStatus(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

// ---------- optional Cloudflare Turnstile human check ----------
// One check yields a signed 30-minute session from the Worker, so players are not
// challenged on every move.
let session = null; // { token, exp }

async function getSession() {
  if (session && session.exp - 60 > Date.now() / 1000) return session.token;
  const token = await turnstileToken();
  const data = await postJson(CONFIG.proxyUrl.replace(/\/decide\/?$/, '/session'), { token });
  session = { token: data.session, exp: data.exp };
  return session.token;
}

function turnstileToken() {
  return new Promise((resolve, reject) => {
    const render = () => {
      const box = document.createElement('div');
      box.className = 'ts-box';
      document.body.append(box);
      window.turnstile.render(box, {
        sitekey: CONFIG.turnstileSiteKey,
        appearance: 'interaction-only',
        callback: (tok) => { resolve(tok); setTimeout(() => box.remove(), 400); },
        'error-callback': () => { box.remove(); reject(new Error('turnstile')); },
      });
    };
    if (window.turnstile) return render();
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = render;
    s.onerror = () => reject(new Error('turnstile-load'));
    document.head.append(s);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {string} game  game id (matches shared/prompts.js)
 * @param {object | ((mode: 'hinted'|'raw') => object)} makePayload
 *        schema-checked game state, or a function building it for the current Jev mode
 *        ('hinted': code-computed odds as semantic buckets; 'raw': raw record only)
 * @param {(hintedPayload) => object} local  practice bot (Practice mode, or when Jev is limited)
 */
export async function decide(game, makePayload, local) {
  const t0 = performance.now();
  const build = typeof makePayload === 'function' ? makePayload : () => makePayload;
  const mode = effectiveMode();
  let error;
  if (mode !== 'practice') {
    const limited = getJevStatus();
    if (limited) error = limited.code;
    else {
      try {
        const data = await askJev(game, build(mode), mode);
        // Policy 'greedy': Jev plays its top-rated move (like temperature 0); 'sample': a move is
        // drawn in proportion to its probabilities. pickAction reads the marker.
        const policy = settings.get('policy');
        if (policy === 'greedy') for (const a of Object.values(data.answers || {})) if (a && a.type === 'choice') Object.defineProperty(a, 'greedy', { value: true });
        return { answers: data.answers, model: data.model, source: 'jev', mode, policy, ms: Math.round(performance.now() - t0) };
      } catch (e) {
        error = classify(e);
        startCooldown(error, e.retryAfter);
        console.warn('[jev] practice bot stands in:', error, e);
      }
    }
  }
  const answers = local(build('hinted'));
  const elapsed = performance.now() - t0;
  if (elapsed < 450) await sleep(450 - elapsed); // give the bot a moment to "think"
  return { answers, model: 'practice bot', source: 'local', mode, ms: Math.round(performance.now() - t0), error };
}

// ---------- helpers for games & built-in bots ----------

export function normalize(probs) {
  const entries = Object.entries(probs).map(([k, v]) => [k, Math.max(0, Number(v) || 0)]);
  const sum = entries.reduce((a, [, v]) => a + v, 0);
  if (sum <= 0) return Object.fromEntries(entries.map(([k]) => [k, 1 / entries.length]));
  return Object.fromEntries(entries.map(([k, v]) => [k, v / sum]));
}

/** Build a Choice answer (API shape) from raw weights. */
export function choiceAnswer(weights) {
  const probabilities = normalize(weights);
  const keys = Object.keys(probabilities);
  const choice = keys.reduce((a, b) => (probabilities[b] > probabilities[a] ? b : a));
  const n = keys.length;
  const entropy = -keys.reduce((a, k) => a + (probabilities[k] > 0 ? probabilities[k] * Math.log(probabilities[k]) : 0), 0);
  const confidence = n > 1 ? 1 - entropy / Math.log(n) : 1;
  return { type: 'choice', choice, probabilities, confidence };
}

export const noulAnswer = (p) => ({ type: 'noul', noul: Math.min(1, Math.max(0, p)) });

/**
 * Pick an action from a Choice answer, restricted to `legal`.
 * Answers marked `greedy` (Jev, when the visit's policy is 'greedy') → the highest-probability
 * legal move. Everything else (Jev under the 'sample' policy, the practice bot, and mixes built
 * by game code such as Rock-Paper-Scissors' counter-strategy) is sampled from its distribution.
 */
export function pickAction(answer, legal) {
  const probs = normalize(Object.fromEntries(legal.map((a) => [a, answer?.probabilities?.[a] ?? 0])));
  if (answer?.greedy) return legal.reduce((best, a) => (probs[a] > probs[best] ? a : best), legal[0]);
  let r = Math.random();
  for (const a of legal) {
    r -= probs[a];
    if (r <= 0) return a;
  }
  return legal[legal.length - 1];
}
