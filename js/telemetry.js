// Anonymous gameplay telemetry (see shared/telemetry.js for the exact format).
// Nothing is sent when the player opts out, when no proxy is configured, or for events the
// shared schema would reject. Events are batched and flushed at the end of a match, every
// few moves, and when the tab is hidden.

import { CONFIG } from './config.js';
import { VERSION } from './version.js';
import { settings, effectiveMode } from './settings.js';

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
  const batch = { s: matchId, r: settings.get('research') === true, l: settings.get('lang'), av: VERSION, e: queue.splice(0, 60) };
  if (!sharingEnabled()) return;
  const body = JSON.stringify(batch);
  // text/plain keeps this a "simple" CORS request (no preflight), which sendBeacon requires
  if (beacon && navigator.sendBeacon?.(endpoint(), new Blob([body], { type: 'text/plain' }))) return;
  fetch(endpoint(), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body, keepalive: true }).catch(() => {});
}

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush({ beacon: true }); });

/**
 * Per-game tracker. Games call:
 *   track.start()                                   new match (fresh anonymous id)
 *   track.human({ ph, act, x })                     the human's move
 *   track.opp(res, { ph, act, x })                  the opponent's move; res = decide() result
 *   track.end('win' | 'lose' | 'draw')              match over (human's point of view)
 */
export function createTracker(game, gameVersion = '1.0') {
  const base = () => ({ g: game, gv: gameVersion, m: effectiveMode() });
  const push = (ev) => {
    if (!sharingEnabled()) return;
    for (const k of Object.keys(ev)) if (ev[k] === undefined || ev[k] === null) delete ev[k];
    queue.push(ev);
    if (queue.length >= FLUSH_EVERY) flush();
  };
  return {
    start() { flush(); matchId = newId(); },
    human(e) { push({ ...base(), k: 'move', a: 'human', ...e }); },
    opp(res, e) {
      const jev = res?.source === 'jev';
      push({ ...base(), k: 'move', a: jev ? 'jev' : 'bot', ...(jev && res.model ? { mdl: String(res.model).toLowerCase() } : {}), ...e });
    },
    end(result) { push({ ...base(), k: 'end', act: result }); flush(); matchId = newId(); },
  };
}
