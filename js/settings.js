import { CONFIG } from './config.js';

const KEY = 'jev-game-theory-settings';
const MODES = ['hinted', 'raw', 'practice'];
const listeners = new Set();

// First visit: follow the browser language (Chinese → 中文, anything else → English).
const browserLang = () => {
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  return String(langs[0]).toLowerCase().startsWith('zh') ? 'zh' : 'en';
};

const defaults = {
  lang: browserLang(),
  theme: 'auto',            // auto | light | dark
  jevMode: 'hinted',        // hinted: code computes odds for Jev | raw: Jev sees only the raw record | practice: no Jev
};

let state = { ...defaults, ...safeParse(storageGet(KEY)) };
if (!MODES.includes(state.jevMode)) state.jevMode = 'hinted';
if (!['zh', 'en'].includes(state.lang)) state.lang = defaults.lang;

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

/** Is a Jev proxy configured for this deployment? */
export const jevAvailable = () => Boolean(CONFIG.proxyUrl);

/** The mode actually in effect: practice when no proxy is configured. */
export const effectiveMode = () => (jevAvailable() ? state.jevMode : 'practice');
