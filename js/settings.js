import { CONFIG } from './config.js';

const KEY = 'jev-game-theory-settings';
const listeners = new Set();

const defaults = {
  lang: (navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en',
  theme: 'auto',            // auto | light | dark
  jevMode: 'hinted',        // hinted: code computes odds for Jev | raw: Jev sees only the raw record
};

let state = { ...defaults, ...safeParse(storageGet(KEY)) };
if (!['hinted', 'raw'].includes(state.jevMode)) state.jevMode = 'hinted';

function storageGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}

function safeParse(s) {
  try { return JSON.parse(s) || {}; } catch { return {}; }
}

export const settings = {
  get: (k) => state[k],
  set(k, v) {
    if (state[k] === v) return;
    state = { ...state, [k]: v };
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked: settings last for this visit only */ }
    listeners.forEach((fn) => fn(k, v));
  },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

// A personal API key (bring-your-own-key) is kept in sessionStorage only:
// it disappears when the tab closes and is never sent anywhere except TypeSafe.
export function getByokKey() {
  try { return sessionStorage.getItem('jev-byok') || ''; } catch { return ''; }
}
export function setByokKey(k) {
  if (k) sessionStorage.setItem('jev-byok', k.trim());
  else sessionStorage.removeItem('jev-byok');
}
export const jevAvailable = () => Boolean(CONFIG.proxyUrl || getByokKey());
