import { CONFIG } from './config.js';

const KEY = 'jev-game-theory-settings';
const listeners = new Set();

const defaults = {
  lang: (navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en',
  theme: 'auto',            // auto | light | dark
  mode: CONFIG.proxyUrl ? 'jev' : 'local', // jev | local
  play: 'mixed',            // mixed: sample from Jev's distribution | greedy: argmax
};

let state = { ...defaults, ...safeParse(localStorage.getItem(KEY)) };
if (state.mode === 'jev' && !CONFIG.proxyUrl && !getByokKey()) state.mode = 'local';

function safeParse(s) {
  try { return JSON.parse(s) || {}; } catch { return {}; }
}

export const settings = {
  get: (k) => state[k],
  set(k, v) {
    if (state[k] === v) return;
    state = { ...state, [k]: v };
    localStorage.setItem(KEY, JSON.stringify(state));
    listeners.forEach((fn) => fn(k, v));
  },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

// A personal API key (bring-your-own-key) is kept in sessionStorage only:
// it disappears when the tab closes and is never sent anywhere except TypeSafe.
export function getByokKey() { return sessionStorage.getItem('jev-byok') || ''; }
export function setByokKey(k) {
  if (k) sessionStorage.setItem('jev-byok', k.trim());
  else sessionStorage.removeItem('jev-byok');
}
export const jevAvailable = () => Boolean(CONFIG.proxyUrl || getByokKey());
