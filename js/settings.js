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
  share: true,              // anonymous gameplay statistics (opt-out)
  research: false,          // also allow use in research publications (opt-in)
  noticeSeen: false,        // data notice acknowledged
};

let state = { ...defaults, ...safeParse(storageGet(KEY)) };
// The opponent mode is per visit: each time the site is opened, Hinted or Raw is assigned at
// random (50/50) so both get played equally; a player's own switch lasts for that visit (tab).
const SESSION_MODE = 'jev-gtl-mode';
state.jevMode = (() => {
  try { const m = sessionStorage.getItem(SESSION_MODE); if (MODES.includes(m)) return m; } catch { /* ignore */ }
  const m = Math.random() < 0.5 ? 'hinted' : 'raw';
  try { sessionStorage.setItem(SESSION_MODE, m); } catch { /* ignore */ }
  return m;
})();
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
    try {
      if (k === 'jevMode') sessionStorage.setItem(SESSION_MODE, v);
      const { jevMode, ...persist } = state; // the mode is per visit, not remembered across visits
      localStorage.setItem(KEY, JSON.stringify(persist));
    } catch { /* storage blocked: settings last for this visit only */ }
    listeners.forEach((fn) => fn(k, v));
  },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

/** Is a Jev proxy configured for this deployment? */
export const jevAvailable = () => Boolean(CONFIG.proxyUrl);

/** The mode actually in effect: practice when no proxy is configured. */
export const effectiveMode = () => (jevAvailable() ? state.jevMode : 'practice');
