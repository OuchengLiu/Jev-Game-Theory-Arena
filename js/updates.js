// Release announcements.
//  * If /version.json is newer than the code running in this tab, offer a one-click refresh
//    (checked at start-up, every 10 minutes and whenever the tab becomes visible again).
//  * The first time a visitor runs a new version, show its release notes once.

import { VERSION } from './version.js';
import { settings } from './settings.js';
import { t } from './i18n.js';
import { h } from './ui.js';

const SEEN_KEY = 'jev-gtl-seen-version';
let latest = null;   // parsed version.json
let dismissed = '';  // version whose "update available" card was closed this session
let box = null;

async function fetchLatest() {
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (r.ok) latest = await r.json();
  } catch { /* offline: ignore */ }
}

const storage = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

// Re-download every same-origin file this page loaded, bypassing the HTTP cache, then reload.
// Equivalent to Ctrl+Shift+R, but works on phones too.
async function hardRefresh() {
  const urls = new Set(performance.getEntriesByType('resource').map((e) => e.name)
    .filter((u) => u.startsWith(location.origin) && !u.includes('version.json')));
  urls.add(location.href.split('#')[0]);
  await Promise.all([...urls].map((u) => fetch(u, { cache: 'reload' }).catch(() => null)));
  location.reload();
}

function card(kind) {
  const lang = settings.get('lang');
  const v = latest?.version || VERSION;
  const notes = latest?.version === VERSION ? latest?.notes?.[lang] || latest?.notes?.en || [] : [];
  const close = () => {
    if (kind === 'new') dismissed = v; else storage.set(SEEN_KEY, VERSION);
    box?.remove(); box = null;
  };
  return h('div.update', { role: 'status', class: kind === 'new' ? 'update-new' : '' },
    h('div.update-head',
      h('span.update-dot'),
      h('b', kind === 'new' ? t('update.new', { v }) : t('update.whatsnew', { v: VERSION })),
      h('button.icon-btn.sm', { type: 'button', 'aria-label': t('update.ok'), onclick: close, html: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>' }),
    ),
    kind === 'new'
      ? h('p', t('update.new.b'))
      : h('ul', notes.map((n) => h('li', n))),
    h('div.update-actions',
      kind === 'new'
        ? [h('button.btn.ghost.sm', { type: 'button', onclick: close }, t('update.later')), h('button.btn.sm', { type: 'button', onclick: hardRefresh }, t('update.refresh'))]
        : h('button.btn.sm', { type: 'button', onclick: close }, t('update.ok')),
    ),
  );
}

function paint() {
  box?.remove(); box = null;
  if (!latest) return;
  if (latest.version !== VERSION) {
    if (dismissed !== latest.version) box = card('new');
  } else if (storage.get(SEEN_KEY) !== VERSION) {
    if (!storage.get(SEEN_KEY)) { storage.set(SEEN_KEY, VERSION); return; } // first-ever visit: no "what's new"
    box = card('notes');
  }
  if (box) document.body.append(box);
}

export async function initUpdates() {
  await fetchLatest();
  paint();
  settings.onChange((k) => { if (k === 'lang' && box) paint(); });
  const check = async () => { await fetchLatest(); if (latest?.version !== VERSION) paint(); };
  setInterval(check, 10 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
}
