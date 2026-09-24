import { t, registerStrings } from './i18n.js';
import { settings, jevAvailable, effectiveMode } from './settings.js';
import { h, ThinkPanel, segmented, toast } from './ui.js';
import { decide, pickAction, choiceAnswer, noulAnswer, normalize, getJevStatus, onJevStatus } from './engine.js';
import { gameIcon, icons } from './icons.js';
import { CONFIG } from './config.js';
import { initUpdates } from './updates.js';

import pd from './games/pd.js';
import rps from './games/rps.js';
import ultimatum from './games/ultimatum.js';
import holdem from './games/holdem.js';
import liarsdice from './games/liarsdice.js';
import blotto from './games/blotto.js';

const GAMES = [holdem, liarsdice, blotto, pd, rps, ultimatum];
GAMES.forEach((g) => registerStrings(g.id, g.strings));

const app = document.getElementById('app');
let current = null; // { game, instance, panel, page }
let heroTimer = null;

const svgEl = (markup, cls = 'ico') => h(`span.${cls}`, { html: markup });

// ---------------- theme ----------------
function applyTheme() {
  const th = settings.get('theme');
  const dark = th === 'dark' || (th === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.lang = settings.get('lang') === 'zh' ? 'zh-CN' : 'en';
  document.title = settings.get('lang') === 'zh'
    ? 'Jev 博弈实验室：与 Jev AI 玩德州扑克、吹牛骰子、囚徒困境'
    : 'Jev Game Theory Lab — Play poker, liar\'s dice & prisoner\'s dilemma against Jev AI';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
const THEMES = ['auto', 'light', 'dark'];

// ---------------- chrome ----------------
function header() {
  const lang = settings.get('lang');
  const th = settings.get('theme');
  return h('header.topbar',
    h('a.brand', { href: '#/' },
      h('span.logo', h('span'), h('span'), h('span')),
      h('span.brand-text', h('b', t('brand')), h('small', t('brand.sub'))),
    ),
    h('nav.nav',
      h('a.nav-link', { href: '#/' }, t('nav.games')),
      h('a.nav-link', { href: '#/about' }, t('nav.about')),
      h('a.icon-btn', { href: CONFIG.repoUrl, target: '_blank', rel: 'noopener', title: 'GitHub', html: icons.github }),
      h('button.icon-btn', {
        type: 'button', title: t('theme.toggle'), html: icons[{ auto: 'auto', light: 'sun', dark: 'moon' }[th]],
        onclick: () => settings.set('theme', THEMES[(THEMES.indexOf(th) + 1) % THEMES.length]),
      }),
      h('button.lang', { type: 'button', title: 'Language / 语言', onclick: () => settings.set('lang', lang === 'zh' ? 'en' : 'zh') },
        h('span', { class: lang === 'en' ? 'on' : '' }, 'EN'), h('span', { class: lang === 'zh' ? 'on' : '' }, '中')),
    ),
  );
}

function footer() {
  return h('footer.foot',
    h('div.disclaimer', svgEl(icons.shield), h('p', t('disclaimer'))),
    h('div.foot-row',
      h('span', '© 2026 ', t('brand'), ' · ', h('a', { href: CONFIG.repoUrl, target: '_blank', rel: 'noopener' }, t('footer.oss'))),
      h('span.muted', t('footer.unofficial')),
    ),
  );
}

// ---------------- home ----------------
const HERO_SCENES = [
  { game: 'holdem', accent: '#6366f1',
    q: { en: 'Turn. Jev holds A♠ K♠ on K♦ 9♠ 4♣ 2♠. You check-raised.', zh: '转牌。Jev 手握 A♠ K♠，公共牌 K♦ 9♠ 4♣ 2♠，你过牌后加注。' },
    bars: [['raise', { en: 'Raise', zh: '加注' }, 0.58], ['call', { en: 'Call', zh: '跟注' }, 0.31], ['fold', { en: 'Fold', zh: '弃牌' }, 0.11]],
    extra: [{ en: 'You are bluffing', zh: '你在诈唬' }, 0.34] },
  { game: 'liarsdice', accent: '#f59e0b',
    q: { en: 'You bid “five 6s”. Jev can see two 6s and a wild 1 under its cup.', zh: '你叫“5 个 6”。Jev 的骰盅里有两个 6 和一个万能的 1。' },
    bars: [['liar', { en: 'Call Liar!', zh: '开！' }, 0.47], ['b1', { en: 'Six 6s', zh: '6 个 6' }, 0.29], ['b2', { en: 'Six 4s', zh: '6 个 4' }, 0.24]],
    extra: [{ en: 'You are bluffing', zh: '你在诈唬' }, 0.52] },
  { game: 'pd', accent: '#10b981',
    q: { en: 'Round 9 of 10. You defected last round after six rounds of cooperation.', zh: '第 9 / 10 回合。连续合作六轮后，你上一轮背叛了。' },
    bars: [['d', { en: 'Defect', zh: '背叛' }, 0.64], ['c', { en: 'Cooperate', zh: '合作' }, 0.36]],
    extra: [{ en: 'You will cooperate', zh: '你会合作' }, 0.41] },
];

function heroVisual() {
  const lang = settings.get('lang');
  const card = h('div.hero-card');
  let i = 0;
  const paint = () => {
    const s = HERO_SCENES[i % HERO_SCENES.length];
    card.style.setProperty('--accent', s.accent);
    const g = GAMES.find((x) => x.id === s.game);
    card.replaceChildren(
      h('div.hc-top',
        h('span.hc-game', svgEl(gameIcon(s.game, 16)), t(`${g.id}.title`)),
        h('span.hc-model', h('span.pulse'), 'jev-latest · ', 90 + ((i * 37) % 80), ' ms'),
      ),
      h('div.hc-q', s.q[lang]),
      h('div.bars', s.bars.map(([k, label, p], j) => h('div.bar-row', { class: j === 0 ? 'picked' : '' },
        h('div.bar-label', label[lang], j === 0 ? h('span.tag', t('think.picked')) : null),
        h('div.bar-track', h('div.bar-fill', { style: { width: `${p * 100}%` } })),
        h('div.bar-val', `${Math.round(p * 100)}%`)))),
      h('div.hc-foot', h('span', s.extra[0][lang]), h('div.mini-track', h('div.mini-fill', { style: { width: `${s.extra[1] * 100}%` } })), h('b', `${Math.round(s.extra[1] * 100)}%`)),
      h('div.hc-dots', HERO_SCENES.map((_, j) => h('span', { class: j === i % HERO_SCENES.length ? 'on' : '' }))),
    );
    requestAnimationFrame(() => requestAnimationFrame(() => card.querySelectorAll('.bar-fill, .mini-fill').forEach((b) => b.classList.add('in'))));
    i++;
  };
  paint();
  clearInterval(heroTimer);
  heroTimer = setInterval(() => { if (card.isConnected) paint(); else clearInterval(heroTimer); }, 4200);
  return h('div.hero-visual', h('div.hero-glow'), card);
}

function homePage() {
  return h('main.page',
    h('section.hero',
      h('div.hero-text',
        h('div.kicker', h('span.kicker-dot'), t('hero.kicker')),
        h('h1.display', t('hero.title.a'), h('br'), h('em', t('hero.title.b'))),
        h('p.lead', t('hero.body')),
        h('div.hero-cta',
          h('a.btn.lg', { href: '#games', onclick: (e) => { e.preventDefault(); document.getElementById('games').scrollIntoView({ behavior: 'smooth' }); } }, t('hero.cta'), svgEl(icons.arrow)),
          h('a.btn.ghost.lg', { href: '#/about' }, t('hero.cta2')),
        ),
      ),
      heroVisual(),
    ),
    h('section#games.section',
      h('div.section-head', h('h2.display-sm', t('games.title')), h('p.muted', t('games.sub'))),
      h('div.grid', GAMES.map(gameCard)),
    ),
    footer(),
  );
}

function gameCard(g, idx) {
  return h('a.card', { href: `#/play/${g.id}`, style: { '--accent': g.meta.accent } },
    h('div.card-art',
      h('span.card-num', String(idx + 1).padStart(2, '0')),
      svgEl(gameIcon(g.id, 56), 'card-icon'),
    ),
    h('div.card-body',
      h('div.card-meta', h('span.chip', t(`${g.id}.concept`)), h('span.muted', t('meta.minutes', { n: g.meta.minutes }))),
      h('h3', t(`${g.id}.title`)),
      h('p', t(`${g.id}.tagline`)),
    ),
    h('span.card-go', svgEl(icons.arrow)),
  );
}

// ---------------- about ----------------
function aboutPage() {
  return h('main.page.narrow',
    h('a.back', { href: '#/' }, svgEl(icons.back), t('back')),
    h('h1.display', t('about.title')),
    h('p.lead', t('about.lead')),
    h('section.prose',
      h('h2', t('about.jev.t')), h('p', t('about.jev.b')),
      h('h2', t('about.mix.t')), h('p', t('about.mix.b')),
      h('h2', t('about.modes.t')),
      h('div.mode-cards',
        h('div.mode-card', h('b', t('mode.hinted')), h('p', t('mode.info.hinted'))),
        h('div.mode-card', h('b', t('mode.raw')), h('p', t('mode.info.raw'))),
        h('div.mode-card', h('b', t('mode.practice')), h('p', t('mode.info.practice'))),
      ),
      h('p.muted', t('mode.info.note')),
      h('h2', t('about.games.t')),
      h('div.about-games', GAMES.map((g) => h('a.about-game', { href: `#/play/${g.id}`, style: { '--accent': g.meta.accent } },
        svgEl(gameIcon(g.id, 22), 'ag-icon'), h('span', h('b', t(`${g.id}.title`)), h('small.muted', t(`${g.id}.concept`)))))),
      h('h2', t('about.disc.t')), h('p', t('disclaimer')),
      h('h2', t('about.oss.t')), h('p', t('about.oss.b'), ' ', h('a.link', { href: CONFIG.repoUrl, target: '_blank', rel: 'noopener' }, 'GitHub →')),
    ),
    footer(),
  );
}

// ---------------- game page ----------------
function modeControl() {
  const wrap = h('div.control');
  const jev = jevAvailable();
  const pop = h('div.popover', { role: 'dialog', hidden: true },
    h('div.pop-head', h('b', t('mode.info.title')), h('button.icon-btn.sm', { type: 'button', html: icons.close, onclick: () => { pop.hidden = true; } })),
    h('div.pop-item', h('span.chip', t('mode.hinted')), h('p', t('mode.info.hinted'))),
    h('div.pop-item', h('span.chip', t('mode.raw')), h('p', t('mode.info.raw'))),
    h('div.pop-item', h('span.chip.chip-muted', t('mode.practice')), h('p', t('mode.info.practice'))),
    h('p.pop-note', t('mode.info.note')),
  );
  const info = h('button.info-btn', { type: 'button', title: t('mode.info.title'), 'aria-label': t('mode.info.title'), html: icons.info,
    onclick: (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; } });
  const close = (e) => { if (!wrap.contains(e.target)) pop.hidden = true; };
  document.addEventListener('click', close);
  wrap.cleanup = () => document.removeEventListener('click', close);
  const off = jev ? '' : t('mode.jev.off');
  wrap.append(
    h('span.control-label', t('jevmode.label'), info),
    segmented([
      { value: 'hinted', label: t('mode.hinted'), disabled: !jev, title: off },
      { value: 'raw', label: t('mode.raw'), disabled: !jev, title: off },
      { value: 'practice', label: t('mode.practice') },
    ], effectiveMode(), (v) => settings.set('jevMode', v)),
    pop,
  );
  return wrap;
}

// Notice shown while Jev is limited (quota, too fast, blocked, outage), with a live countdown.
function limitBanner() {
  const el = h('div.limit', { hidden: true, role: 'status' });
  let timer = null;
  const fmt = (sec) => {
    if (sec >= 3600) return t('time.hours', { n: Math.ceil(sec / 3600) });
    if (sec >= 60) return t('time.minutes', { n: Math.ceil(sec / 60) });
    return t('time.seconds', { n: Math.max(1, sec) });
  };
  const paint = () => {
    const st = effectiveMode() === 'practice' ? null : getJevStatus();
    if (!st) { el.hidden = true; clearInterval(timer); timer = null; return; }
    const left = Math.ceil((st.until - Date.now()) / 1000);
    el.hidden = false;
    el.className = `limit limit-${st.code}`;
    el.replaceChildren(
      h('span.limit-dot'),
      h('div.limit-text', h('b', t(`limit.${st.code}.t`)), h('span', t(`limit.${st.code}.b`, { time: fmt(left) }))),
      h('button.btn.ghost.sm', { type: 'button', onclick: () => settings.set('jevMode', 'practice') }, t('limit.switch')),
    );
    if (!timer) timer = setInterval(paint, 1000);
  };
  const unsub = onJevStatus(paint);
  el.cleanup = () => { unsub(); clearInterval(timer); };
  paint();
  return el;
}

// Rules: a prominent "How to play" pill. Open automatically the first time a game is visited.
function rulesToggle(game) {
  const key = `jev-gtl-seen-${game.id}`;
  let seen = false;
  try { seen = localStorage.getItem(key) === '1'; localStorage.setItem(key, '1'); } catch { /* storage blocked */ }
  if (rulesToggle.open?.[game.id] !== undefined) seen = !rulesToggle.open[game.id];
  const d = h('details.rules', { open: !seen },
    // record only real clicks (setting `open` in code also fires a toggle event)
    h('summary', { onclick: () => { (rulesToggle.open ||= {})[game.id] = !d.open; } }, svgEl(icons.book), t('rules')),
    h('p', t(`${game.id}.rules`)));
  return d;
}

function gamePage(game) {
  const panel = new ThinkPanel();
  const board = h('section.board');
  // Games pass conditional children (`cond ? el : null`); the native method would print "null".
  board.replaceChildren = (...kids) => Element.prototype.replaceChildren.call(board, ...kids.flat(Infinity).filter((k) => k != null && k !== false));
  const mode = modeControl();
  const banner = limitBanner();
  const page = h('main.page.game-page', { style: { '--accent': game.meta.accent } },
    h('a.back', { href: '#/' }, svgEl(icons.back), t('back')),
    h('div.game-head',
      h('div.gh-title',
        svgEl(gameIcon(game.id, 30), 'title-icon'),
        h('div',
          h('h1.display-sm', t(`${game.id}.title`)),
          h('p.muted', t(`${game.id}.tagline`)),
        ),
      ),
      h('div.controls', mode),
    ),
    h('div.game-sub',
      rulesToggle(game),
      h('span.badge', svgEl(icons.shield), t('disclaimer.short')),
      !jevAvailable() ? h('span.badge.offline', h('span.dot-off'), t('status.offline')) : null,
    ),
    banner,
    h('div.game-layout', board, panel.el),
    footer(),
  );
  page.cleanup = () => { mode.cleanup(); banner.cleanup(); };
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
  current?.page?.cleanup?.();
  current?.instance?.destroy?.();
  current = null;
  window.scrollTo(0, 0);

  let page;
  if (game) {
    const built = gamePage(game);
    current = { game, ...built };
    page = built.page;
  } else if (hash.startsWith('#/about')) page = aboutPage();
  else page = homePage();
  app.replaceChildren(header(), page);
}

// Re-render header + game chrome while preserving the game's board/state.
function rebuildGameChrome(game) {
  const { instance, panel } = current;
  const boardEl = current.page.querySelector('.board');
  current.page.cleanup?.();
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
initUpdates();
