import { t, registerStrings } from './i18n.js';
import { settings, jevAvailable, getByokKey, setByokKey } from './settings.js';
import { h, ThinkPanel, segmented, toast } from './ui.js';
import { decide, pickAction, choiceAnswer, noulAnswer, normalize } from './engine.js';
import { CONFIG } from './config.js';

import pd from './games/pd.js';
import rps from './games/rps.js';
import ultimatum from './games/ultimatum.js';
import holdem from './games/holdem.js';
import liarsdice from './games/liarsdice.js';

const GAMES = [holdem, liarsdice, pd, rps, ultimatum];
GAMES.forEach((g) => registerStrings(g.id, g.strings));

const app = document.getElementById('app');
let current = null; // { game, instance }

// ---------------- theme ----------------
function applyTheme() {
  const th = settings.get('theme');
  const dark = th === 'dark' || (th === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.lang = settings.get('lang') === 'zh' ? 'zh-CN' : 'en';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

// ---------------- header ----------------
function header() {
  const lang = settings.get('lang');
  return h('header.topbar',
    h('a.brand', { href: '#/' },
      h('span.logo', h('span'), h('span'), h('span')),
      h('span.brand-text', h('b', t('brand')), h('small', t('brand.sub'))),
    ),
    h('nav.nav',
      h('a', { href: '#/' }, t('nav.games')),
      h('a', { href: '#/how' }, t('nav.how')),
      h('a', { href: CONFIG.repoUrl, target: '_blank', rel: 'noopener' }, t('nav.github')),
      h('button.lang', { type: 'button', title: 'Language / 语言', onclick: () => settings.set('lang', lang === 'zh' ? 'en' : 'zh') },
        h('span', { class: lang === 'en' ? 'on' : '' }, 'EN'), h('span', { class: lang === 'zh' ? 'on' : '' }, '中')),
      h('button.icon-btn', { type: 'button', title: t('settings'), onclick: openSettings, html: gearSvg }),
    ),
  );
}

const gearSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';

function footer() {
  return h('footer.foot', h('span', t('footer')), h('span.muted', 'Powered by TypeSafe Jev · System One'));
}

// ---------------- settings dialog ----------------
function openSettings() {
  const input = h('input.input', { type: 'password', placeholder: 'ts_…', value: getByokKey(), autocomplete: 'off' });
  const dlg = h('dialog.modal',
    h('form', { method: 'dialog' },
      h('h3', t('settings')),
      h('label.field', h('span', t('settings.theme')),
        segmented(['auto', 'light', 'dark'].map((v) => ({ value: v, label: t(`theme.${v}`) })), settings.get('theme'), (v) => { settings.set('theme', v); dlg.close(); openSettings(); })),
      h('label.field', h('span', t('settings.key')), input, h('small.muted', t('settings.key.help'))),
      h('div.row-end',
        h('button.btn.ghost', { type: 'button', onclick: () => { setByokKey(''); input.value = ''; settings.set('mode', CONFIG.proxyUrl ? settings.get('mode') : 'local'); rerender(); } }, t('settings.key.clear')),
        h('button.btn', { type: 'button', onclick: () => { setByokKey(input.value); if (input.value) settings.set('mode', 'jev'); dlg.close(); rerender(); } }, t('settings.key.save')),
      ),
    ),
  );
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg);
  dlg.showModal();
}

// ---------------- pages ----------------
function homePage() {
  return h('main.page',
    h('section.hero',
      h('div.hero-text',
        h('div.kicker', t('hero.kicker')),
        h('h1', t('hero.title')),
        h('p.lead', t('hero.body')),
        h('div.hero-cta',
          h('a.btn.lg', { href: '#games', onclick: (e) => { e.preventDefault(); document.getElementById('games').scrollIntoView({ behavior: 'smooth' }); } }, t('hero.cta')),
          h('a.btn.ghost.lg', { href: '#/how' }, t('hero.cta2')),
        ),
      ),
      heroVisual(),
    ),
    h('section#games.section',
      h('div.section-head', h('h2', t('games.title')), h('p.muted', t('games.sub'))),
      h('div.grid', GAMES.map(gameCard)),
    ),
    footer(),
  );
}

function heroVisual() {
  const demo = [['raise', 0.58], ['call', 0.31], ['fold', 0.11]];
  return h('div.hero-card',
    h('div.hc-top', h('span.pulse'), h('span', 'jev-latest'), h('span.muted', '· 112 ms')),
    h('div.hc-q', '“Heads-up hold’em, turn. You hold A♠ K♠ on K♦ 9♠ 4♣ 2♠. Opponent check-raised.”'),
    h('div.bars', demo.map(([k, p], i) => h('div.bar-row', { class: i === 0 ? 'picked' : '' },
      h('div.bar-label', k), h('div.bar-track', h('div.bar-fill.in', { style: { width: `${p * 100}%` } })), h('div.bar-val', `${Math.round(p * 100)}%`)))),
    h('div.hc-foot', h('span', 'opponent bluffing'), h('div.mini-track', h('div.mini-fill.in', { style: { width: '34%' } })), h('b', '34%')),
  );
}

function gameCard(g) {
  return h('a.card', { href: `#/play/${g.id}`, style: { '--accent': g.meta.accent } },
    h('div.card-icon', g.meta.icon),
    h('div.card-body',
      h('h3', t(`${g.id}.title`)),
      h('p', t(`${g.id}.tagline`)),
    ),
    h('div.card-meta',
      h('span.chip', t(`${g.id}.concept`)),
      h('span.muted', t('meta.minutes', { n: g.meta.minutes })),
    ),
  );
}

function howPage() {
  return h('main.page.narrow',
    h('a.back', { href: '#/' }, '← ', t('back')),
    h('h1', t('how.title')),
    h('div.steps', [1, 2, 3].map((i) => h('div.step', h('div.step-n', i), h('h3', t(`how.${i}.t`)), h('p', t(`how.${i}.b`))))),
    h('div.callout', h('h3', t('how.sec.t')), h('p', t('how.sec.b'))),
    h('pre.code', `POST /decide            (your Cloudflare Worker)
{ "game": "holdem", "payload": { "street": "turn", "legal": ["fold","call","raise"], ... } }

  → Worker validates payload against a strict schema
  → Worker builds the Jev request (prompts never come from the browser)
  → POST https://api.typesafe.ai/v1/systemone   (Bearer key lives only here)

{ "answers": { "action": { "choice": "raise",
    "probabilities": { "raise": 0.58, "call": 0.31, "fold": 0.11 }, "confidence": 0.41 } } }`),
    footer(),
  );
}

function gamePage(game) {
  const panel = new ThinkPanel();
  const board = h('section.board');
  // Games pass conditional children (`cond ? el : null`); the native method would print "null".
  board.replaceChildren = (...kids) => Element.prototype.replaceChildren.call(board, ...kids.flat(Infinity).filter((k) => k != null && k !== false));
  const modeOpts = [
    { value: 'jev', label: t('mode.jev'), disabled: !jevAvailable(), title: jevAvailable() ? '' : t('mode.jev.off') },
    { value: 'local', label: t('mode.local') },
  ];
  const page = h('main.page.game-page', { style: { '--accent': game.meta.accent } },
    h('div.game-head',
      h('div',
        h('a.back', { href: '#/' }, '← ', t('back')),
        h('h1', h('span.title-icon', game.meta.icon), t(`${game.id}.title`)),
        h('p.muted', t(`${game.id}.rules`)),
      ),
      h('div.controls',
        h('div.control', h('span', t('mode.label')), segmented(modeOpts, settings.get('mode'), (v) => { settings.set('mode', v); })),
        h('div.control', h('span', t('play.label')), segmented([
          { value: 'mixed', label: t('play.mixed') }, { value: 'greedy', label: t('play.greedy') },
        ], settings.get('play'), (v) => settings.set('play', v))),
      ),
    ),
    !jevAvailable() ? h('div.notice', t('mode.jev.off')) : null,
    h('div.game-layout', board, panel.el),
    footer(),
  );
  const ctx = { t, h, panel, decide, pickAction, choiceAnswer, noulAnswer, normalize, toast, settings };
  const instance = game.mount(board, ctx);
  return { page, instance, panel };
}

// ---------------- router ----------------
function route() {
  const hash = location.hash || '#/';
  const m = hash.match(/^#\/play\/(\w+)/);
  const game = m && GAMES.find((g) => g.id === m[1]);

  // Keep a running game alive across language / setting changes.
  if (game && current?.game === game) {
    rebuildGameChrome(game);
    return;
  }
  current?.instance?.destroy?.();
  current = null;
  window.scrollTo(0, 0);

  let page;
  if (game) {
    const built = gamePage(game);
    current = { game, ...built };
    page = built.page;
  } else if (hash.startsWith('#/how')) page = howPage();
  else page = homePage();
  app.replaceChildren(header(), page);
}

// Re-render header + game chrome while preserving the game's board/state.
function rebuildGameChrome(game) {
  const { instance, panel } = current;
  const boardEl = current.page.querySelector('.board');
  const built = gamePage({ ...game, mount: () => instance });
  built.page.querySelector('.board').replaceWith(boardEl);
  built.page.querySelector('.think').replaceWith(panel.el);
  current = { game, instance, panel, page: built.page };
  app.replaceChildren(header(), built.page);
  instance.render?.();
  panel.rerender?.();
}

function rerender() {
  applyTheme();
  route();
}

settings.onChange(rerender);
window.addEventListener('hashchange', route);
applyTheme();
route();
