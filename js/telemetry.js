// Anonymous gameplay telemetry (see shared/telemetry.js for the exact format).
// Nothing is sent when the player opts out, when no proxy is configured, or for events the
// shared schema would reject. Events are batched and flushed at the end of a match, every
// few moves, and when the tab is hidden.

import { CONFIG } from './config.js';
import { VERSION } from './version.js';
import { settings, effectiveMode } from './settings.js';
import { getJevStatus } from './engine.js';
import { bucketOf } from '../shared/telemetry.js';

const endpoint = () => (CONFIG.proxyUrl ? CONFIG.proxyUrl.replace(/\/decide\/?$/, '/log') : '');
export const sharingEnabled = () => settings.get('share') !== false && Boolean(endpoint());

const FLUSH_EVERY = 12;
let queue = [];        // pending events for the current match id
let matchId = newId();

function newId() {
  const b = new Uint8Array(10);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => (x % 36).toString(36)).join('') + Date.now().toString(36).slice(-4);
}

function flush({ beacon = false } = {}) {
  if (!queue.length) return;
  // one consent covers statistics and possible future research, so every batch that is sent carries it
  const batch = { s: matchId, r: settings.get('share') !== false, l: settings.get('lang'), av: VERSION, e: queue.splice(0, 60) };
  if (!sharingEnabled()) return;
  const body = JSON.stringify(batch);
  // text/plain keeps this a "simple" CORS request (no preflight), which sendBeacon requires
  if (beacon && navigator.sendBeacon?.(endpoint(), new Blob([body], { type: 'text/plain' }))) return;
  fetch(endpoint(), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body, keepalive: true }).catch(() => {});
}

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush({ beacon: true }); });

// The opponent's full distribution for the main decision, plus its yes/no judgements.
// Skipped for x:'pred' events (a prediction record, not a decision) to avoid duplicates.
const MAIN = ['action', 'predict', 'offer', 'respond'];
function probsOf(res, e) {
  if (!res?.answers || e?.x === 'pred') return {};
  const out = {};
  const main = MAIN.map((k) => res.answers[k]).find((a) => a?.probabilities);
  if (main) out.pr = Object.fromEntries(Object.entries(main.probabilities).slice(0, 70).map(([k, v]) => [k, Math.round(Number(v) * 1000) / 1000]));
  const nouls = Object.entries(res.answers).filter(([, a]) => a?.type === 'noul' && typeof a.noul === 'number').slice(0, 4);
  if (nouls.length) out.nl = Object.fromEntries(nouls.map(([k, a]) => [k, Math.round(a.noul * 1000) / 1000]));
  return out;
}

/**
 * Per-game tracker. Games call:
 *   track.start()                                   new match (fresh anonymous id)
 *   track.human({ ph, act, x }, res?)               the human's move (res: the simultaneous opponent decision)
 *   track.opp(res, { ph, act, x })                  the opponent's move; res = decide() result
 *   track.cal(res, { ph, p, truth })                calibration: opponent's yes/no probability vs outcome
 *   track.end('win' | 'lose' | 'draw')              match over (human's point of view)
 */
export function createTracker(game, gameVersion = '1.0') {
  // m is the opponent actually playing: while Jev is limited the practice bot stands in, so those
  // events count as practice (never as games against Jev).
  const withMode = (m, pol) => ({ g: game, gv: gameVersion, m, ...(m !== 'practice' ? { pol } : {}) });
  const base = () => withMode(getJevStatus() ? 'practice' : effectiveMode(), settings.get('policy'));
  // an opponent decision is tagged with the mode and policy it was actually made under
  const oppBase = (res) => (res?.source === 'jev' && ['hinted', 'raw'].includes(res.mode)
    ? withMode(res.mode, res.policy || settings.get('policy'))
    : withMode('practice'));
  const push = (ev) => {
    if (!sharingEnabled()) return;
    for (const k of Object.keys(ev)) if (ev[k] === undefined || ev[k] === null) delete ev[k];
    queue.push(ev);
    if (queue.length >= FLUSH_EVERY) flush();
  };
  return {
    start() { flush(); matchId = newId(); },
    /** res (optional): the opponent decision this move was played against, in simultaneous games. */
    human(e, res) { push({ ...(res ? oppBase(res) : base()), k: 'move', a: 'human', ...e }); },
    opp(res, e) {
      const jev = res?.source === 'jev';
      push({ ...oppBase(res), k: 'move', a: jev ? 'jev' : 'bot', ...(jev && res.model ? { mdl: String(res.model).toLowerCase() } : {}), ...probsOf(res, e), ...e });
    },
    /** Calibration: the opponent's probability p (0..1) for yes/no question `ph`, and whether it came true. */
    cal(res, { ph, p, truth }) {
      if (typeof p !== 'number' || Number.isNaN(p) || typeof truth !== 'boolean') return;
      const jev = res?.source === 'jev';
      push({ ...oppBase(res), k: 'cal', a: jev ? 'jev' : 'bot', ...(jev && res.model ? { mdl: String(res.model).toLowerCase() } : {}), ph, act: bucketOf(p), x: truth ? 'yes' : 'no' });
    },
    end(result) { push({ ...base(), k: 'end', act: result }); flush(); matchId = newId(); },
  };
}
