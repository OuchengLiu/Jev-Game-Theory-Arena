// The decision engine: asks Jev (through the proxy, or directly with a personal key)
// and falls back to each game's built-in bot when Jev is unavailable.
//
// Both paths return the same shape as the TypeSafe API:
//   { answers: { <id>: {type:'choice', choice, probabilities, confidence} | {type:'noul', noul} },
//     source: 'jev' | 'local', model, ms, error? }

import { buildJevRequest } from '../shared/prompts.js';
import { CONFIG } from './config.js';
import { settings, getByokKey } from './settings.js';

const TYPESAFE_URL = 'https://api.typesafe.ai/v1/systemone';

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
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function askJev(game, payload) {
  const key = getByokKey();
  if (key) return postJson(TYPESAFE_URL, buildJevRequest(game, payload), { Authorization: `Bearer ${key}` });
  if (!CONFIG.proxyUrl) throw new Error('no-endpoint');
  if (!CONFIG.turnstileSiteKey) return postJson(CONFIG.proxyUrl, { game, payload });
  try {
    return await postJson(CONFIG.proxyUrl, { game, payload }, { 'X-Session': await getSession() });
  } catch (e) {
    if (e.status !== 401) throw e;
    session = null; // expired: redo the human check once
    return postJson(CONFIG.proxyUrl, { game, payload }, { 'X-Session': await getSession() });
  }
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
 * @param {string} game     game id (matches shared/prompts.js)
 * @param {object} payload  compact, schema-checked game state
 * @param {(payload) => object} local  built-in bot returning answers in API shape
 */
export async function decide(game, payload, local) {
  const t0 = performance.now();
  let error;
  if (settings.get('mode') === 'jev') {
    try {
      const data = await askJev(game, payload);
      return { answers: data.answers, model: data.model, source: 'jev', ms: Math.round(performance.now() - t0) };
    } catch (e) {
      error = e.status === 429 ? 'rate-limited' : e.message === 'no-endpoint' ? 'no-endpoint' : 'unavailable';
      console.warn('[jev] falling back to built-in bot:', e);
    }
  }
  const answers = local(payload);
  const elapsed = performance.now() - t0;
  if (elapsed < 450) await sleep(450 - elapsed); // give the bot a moment to "think"
  return { answers, model: 'built-in', source: 'local', ms: Math.round(performance.now() - t0), error };
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
 * 'mixed' samples from the distribution (a true mixed strategy); 'greedy' takes argmax.
 */
export function pickAction(answer, legal) {
  const probs = normalize(Object.fromEntries(legal.map((a) => [a, answer?.probabilities?.[a] ?? 0])));
  if (settings.get('play') === 'greedy') {
    return legal.reduce((a, b) => (probs[b] > probs[a] ? b : a));
  }
  let r = Math.random();
  for (const a of legal) {
    r -= probs[a];
    if (r <= 0) return a;
  }
  return legal[legal.length - 1];
}
