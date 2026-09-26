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
// The opponent mode is per visit: each time the site is opened, Raw or Hinted is assigned at
// random (weighted by HINTED_SHARE); a player's own switch lasts for that visit (tab).
// The play policy is randomised independently: 'greedy' (always Jev's top-rated move) or
// 'sample' (a move drawn in proportion to Jev's probabilities), weighted by GREEDY_SHARE.
const SESSION_MODE = 'jev-gtl-mode';
const SESSION_POLICY = 'jev-gtl-policy';
const POLICIES = ['greedy', 'sample'];
const perVisit = (key, allowed, pick) => {
  try { const v = sessionStorage.getItem(key); if (allowed.includes(v)) return v; } catch { /* ignore */ }
  const v = pick();
  try { sessionStorage.setItem(key, v); } catch { /* ignore */ }
  return v;
};
// Share of visits that get 'hinted' mode; the rest get 'raw'.
export const HINTED_SHARE = 0.25;
state.jevMode = perVisit(SESSION_MODE, MODES, () => (Math.random() < HINTED_SHARE ? 'hinted' : 'raw'));
// Share of visits that get 'greedy' (Top pick); the rest get 'sample' (By odds).
export const GREEDY_SHARE = 0.75;
state.policy = perVisit(SESSION_POLICY, POLICIES, () => (Math.random() < GREEDY_SHARE ? 'greedy' : 'sample'));
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
      if (k === 'policy') sessionStorage.setItem(SESSION_POLICY, v);
      const { jevMode, policy, ...persist } = state; // both are per visit, not remembered across visits
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
