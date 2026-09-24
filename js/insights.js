// Insights page: public, aggregate statistics of how people and Jev play.
// Data: GET <proxy>/stats (pre-aggregated counts, cached 5 min). Until real data exists the
// page shows clearly-labelled sample data so the layout can be judged.

import { t, registerStrings } from './i18n.js';
import { settings } from './settings.js';
import { CONFIG } from './config.js';
import { h } from './ui.js';
import { groupedBars, lineChart, statTile } from './charts.js';
import { gameIcon } from './icons.js';

const MIN_N = 10; // hide rates computed from fewer events

registerStrings('ins', {
  en: {
    title: 'Insights',
    lead: 'How do people play compared with Jev? Every chart below is built from anonymous gameplay across the site and updates every few minutes.',
    sample: 'Sample data. Not enough real games have been played yet, so these charts show made-up numbers to illustrate the page. Real data will replace them automatically.',
    updated: 'Updated {time}',
    matches: 'Matches played', moves: 'Moves recorded', humanWin: 'Human win rate',
    vs: 'vs {opp}',
    series_human: 'Humans', 'series_jev-hinted': 'Jev · Hinted', 'series_jev-raw': 'Jev · Raw', series_bot: 'Practice bot',
    table: 'Table', chart: 'Chart',
    version: 'Game version', allVersions: 'All versions',
    pd_chart: 'Cooperation rate by round', pd_note: 'Share of players who cooperated in each round. Watch for end-game defection in the last rounds.',
    rps_chart: 'Throw mix', rps_note: 'The Nash equilibrium is exactly 1/3 each. Any tilt away from it can be exploited.',
    rps_hit: 'How often Jev guessed your next throw',
    ug_offer: 'Offers made by proposers', ug_offer_note: 'Coins offered to the other side (out of 10).',
    ug_accept: 'Acceptance rate by offer size', ug_accept_note: 'Game theory says accept anything above 0. People usually don’t.',
    bl_chart: 'Most common splits', bl_note: 'Soldiers per field, sorted high to low, regardless of which field got what.',
    ld_chart: 'Bluffing and challenging', ld_bluff: 'Bluff rate', ld_liar: 'Correct “Liar!” calls',
    ld_note: 'Bluff rate: share of bids that were unlikely to be true given the bidder’s own dice.',
    hd_chart: 'Playing style', hd_aggr: 'Aggression', hd_bluff: 'Bluffs among bets', hd_fold: 'Fold rate',
    hd_note: 'Aggression: bets, raises and all-ins as a share of all actions. Bluffs: aggressive actions made with a weak hand.',
    privacy_t: 'Your data, your choice',
    privacy_b: 'We record moves (for example “round 3: cooperated”), never who made them. There is no IP address, account, device fingerprint or free text, and each match gets a random id that isn’t linked to you. Nothing is sold or shared except the aggregate charts on this page.',
    share: 'Contribute anonymous gameplay statistics',
    research: 'Also allow my anonymous data to be used in academic research',
    research_note: 'Off by default. Only games played with this switched on would ever be used for publications, and only after ethics approval.',
    offline: 'Statistics aren’t available yet.',
  },
  zh: {
    title: '数据洞察',
    lead: '人类和 Jev 的打法有什么不同？下面的每张图都来自全站的匿名对局数据，每隔几分钟更新一次。',
    sample: '示例数据。真实对局还不够多，下面的图用的是虚构数字，只为展示页面效果。真实数据积累后会自动替换。',
    updated: '更新于 {time}',
    matches: '对局数', moves: '记录的出招数', humanWin: '人类胜率',
    vs: '对 {opp}',
    series_human: '人类', 'series_jev-hinted': 'Jev · 提示模式', 'series_jev-raw': 'Jev · 直觉模式', series_bot: '练习机器人',
    table: '表格', chart: '图表',
    version: '游戏版本', allVersions: '全部版本',
    pd_chart: '各回合的合作率', pd_note: '每一回合选择合作的比例。留意最后几回合的“终局背叛”。',
    rps_chart: '出拳分布', rps_note: '纳什均衡恰好是各 1/3，任何偏离都可能被针对。',
    rps_hit: 'Jev 猜中你下一手的比例',
    ug_offer: '提议者的出价分布', ug_offer_note: '分给对方的金币数（满分 10）。',
    ug_accept: '不同出价的接受率', ug_accept_note: '博弈论说只要大于 0 就该接受，但人往往不这么做。',
    bl_chart: '最常见的兵力分配', bl_note: '各战场兵力从高到低排列，不区分具体是哪个战场。',
    ld_chart: '诈唬与开牌', ld_bluff: '诈唬率', ld_liar: '“开！”的正确率',
    ld_note: '诈唬率：按叫点者自己的骰子来看，不太可能成立的叫点所占比例。',
    hd_chart: '打法风格', hd_aggr: '激进度', hd_bluff: '下注中的诈唬比例', hd_fold: '弃牌率',
    hd_note: '激进度：下注、加注和全下占全部动作的比例。诈唬：拿着弱牌做出的激进动作。',
    privacy_t: '你的数据，由你决定',
    privacy_b: '我们只记录出招（例如“第 3 回合：合作”），从不记录是谁出的招：没有 IP、账号、设备指纹或任何自由文本，每局对局只有一个和你无关的随机 ID。数据不会出售或分享，公开的只有本页的汇总图表。',
    share: '贡献匿名对局统计',
    research: '同时允许我的匿名数据用于学术研究',
    research_note: '默认关闭。只有打开这个开关时玩的对局，才可能在通过伦理审查后用于发表。',
    offline: '统计数据暂时不可用。',
  },
}, { game: false });

const SERIES = ['human', 'jev-hinted', 'jev-raw', 'bot'];
const seriesOf = (r) => (r.actor === 'human' ? 'human' : r.actor === 'jev' ? `jev-${r.mode}` : r.actor === 'bot' ? 'bot' : null);
const oppOfMode = { hinted: 'jev-hinted', raw: 'jev-raw', practice: 'bot' };

// ---------- data ----------
async function loadStats() {
  if (!CONFIG.proxyUrl) return null;
  try {
    const r = await fetch(CONFIG.proxyUrl.replace(/\/decide\/?$/, '/stats'));
    const j = await r.json();
    if (!j.enabled) return null;
    const rows = j.rows.map((a) => Object.fromEntries(j.cols.map((c, i) => [c, a[i]])));
    return { rows, updated: j.updated };
  } catch { return null; }
}

function sampleRows() {
  // Deterministic, plausible-looking numbers for the empty state.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rows = [];
  const add = (game, mode, actor, kind, phase, act, detail, n) => rows.push({ game, game_ver: '1.1', mode, actor, model: actor === 'jev' ? 'jev-1.13.0' : '', kind, phase, act, detail, n: Math.round(n) });
  const opps = [['hinted', 'jev'], ['raw', 'jev'], ['practice', 'bot']];
  for (const g of ['pd', 'rps', 'ultimatum', 'blotto', 'liarsdice', 'holdem']) {
    opps.forEach(([m], i) => { add(g, m, '', 'end', '', 'win', '', 40 + 30 * rnd() + i * 15); add(g, m, '', 'end', '', 'lose', '', 55 + 25 * rnd() - i * 10); add(g, m, '', 'end', '', 'draw', '', 8 * rnd()); });
  }
  for (let r = 1; r <= 10; r++) {
    const endgame = r >= 9 ? 0.35 : 0;
    add('pd', 'hinted', 'human', 'move', `r${r}`, 'C', '', 300 * (0.72 - endgame - r * 0.01));
    add('pd', 'hinted', 'human', 'move', `r${r}`, 'D', '', 300 * (0.28 + endgame + r * 0.01));
    [['hinted', 'jev', 0.78, 0.5], ['raw', 'jev', 0.64, 0.15], ['practice', 'bot', 0.7, 0.4]].forEach(([m, a, base, drop]) => {
      const c = base - (r >= 9 ? drop : 0) + 0.04 * (rnd() - 0.5);
      add('pd', m, a, 'move', `r${r}`, 'C', '', 120 * c); add('pd', m, a, 'move', `r${r}`, 'D', '', 120 * (1 - c));
    });
  }
  const mix = { human: [0.37, 0.34, 0.29], 'jev-hinted': [0.33, 0.35, 0.32], 'jev-raw': [0.30, 0.41, 0.29], bot: [0.34, 0.33, 0.33] };
  for (const [k, p] of Object.entries(mix)) {
    const [m, a] = k === 'human' ? ['hinted', 'human'] : k === 'bot' ? ['practice', 'bot'] : [k.slice(4), 'jev'];
    ['rock', 'paper', 'scissors'].forEach((act, i) => add('rps', m, a, 'move', 'r1', act, a === 'human' ? '' : (i === 0 ? 'hit' : 'miss'), 900 * p[i]));
    if (a !== 'human') add('rps', m, a, 'move', 'r2', 'rock', 'hit', 900 * (k === 'jev-hinted' ? 0.1 : 0.05));
  }
  const offer = { human: [0.02, 0.05, 0.07, 0.12, 0.22, 0.44, 0.05, 0.01, 0.01, 0, 0.01], 'jev-hinted': [0, 0.01, 0.04, 0.2, 0.42, 0.3, 0.03, 0, 0, 0, 0], 'jev-raw': [0.03, 0.08, 0.14, 0.2, 0.25, 0.26, 0.03, 0.01, 0, 0, 0] };
  for (const [k, p] of Object.entries(offer)) {
    const [m, a] = k === 'human' ? ['hinted', 'human'] : [k.slice(4), 'jev'];
    p.forEach((v, o) => add('ultimatum', m, a, 'move', 'r1', `o${o}`, '', 400 * v));
  }
  for (let o = 0; o <= 10; o++) {
    const hum = Math.min(0.97, 0.05 + o * 0.19), jev = Math.min(0.99, 0.2 + o * 0.16), raw = Math.min(0.99, 0.35 + o * 0.12);
    [['hinted', 'human', hum], ['hinted', 'jev', jev], ['raw', 'jev', raw]].forEach(([m, a, p]) => { add('ultimatum', m, a, 'move', 'r2', 'accept', String(o), 30 * p); add('ultimatum', m, a, 'move', 'r2', 'reject', String(o), 30 * (1 - p)); });
  }
  const shapes = { '4-3-3': [0.26, 0.18, 0.12], '5-3-2': [0.18, 0.2, 0.16], '4-4-2': [0.14, 0.16, 0.14], '5-4-1': [0.1, 0.12, 0.1], '6-2-2': [0.08, 0.1, 0.14], '5-5-0': [0.07, 0.06, 0.1], '6-3-1': [0.06, 0.09, 0.1], '7-2-1': [0.04, 0.04, 0.07] };
  for (const [shape, [hu, jh, jr]] of Object.entries(shapes)) {
    add('blotto', 'hinted', 'human', 'move', 'r1', shape, 'win', 500 * hu); add('blotto', 'hinted', 'jev', 'move', 'r1', shape, 'win', 250 * jh); add('blotto', 'raw', 'jev', 'move', 'r1', shape, 'win', 250 * jr);
  }
  [['hinted', 'human', 0.31, 0.58], ['hinted', 'jev', 0.18, 0.66], ['raw', 'jev', 0.27, 0.55], ['practice', 'bot', 0.14, 0.7]].forEach(([m, a, bluff, right]) => {
    add('liarsdice', m, a, 'move', 'raise', 'bid', 'unlikely', 600 * bluff); add('liarsdice', m, a, 'move', 'raise', 'bid', 'likely', 600 * (1 - bluff));
    add('liarsdice', m, a, 'move', 'raise', 'liar', 'right', 150 * right); add('liarsdice', m, a, 'move', 'raise', 'liar', 'wrong', 150 * (1 - right));
  });
  [['hinted', 'human', 0.34, 0.22, 0.3], ['hinted', 'jev', 0.41, 0.17, 0.24], ['raw', 'jev', 0.29, 0.12, 0.33], ['practice', 'bot', 0.38, 0.2, 0.27]].forEach(([m, a, aggr, bl, fold]) => {
    add('holdem', m, a, 'move', 'flop', 'bet', 'weak', 2000 * aggr * bl); add('holdem', m, a, 'move', 'flop', 'raise', 'strong', 2000 * aggr * (1 - bl));
    add('holdem', m, a, 'move', 'flop', 'fold', 'weak', 2000 * fold); add('holdem', m, a, 'move', 'flop', 'call', 'medium', 2000 * (1 - aggr - fold));
  });
  return rows;
}

// ---------- page ----------
export function insightsPage(footer) {
  const lang = settings.get('lang');
  const page = h('main.page.insights');
  const body = h('div.ins-body', h('div.ins-loading', h('span.dot'), h('span.dot'), h('span.dot')));
  page.append(
    h('div.ins-hero', h('h1.display', t('ins.title')), h('p.lead', t('ins.lead'))),
    body,
    privacyCard(),
    footer(),
  );
  loadStats().then((real) => {
    const hasReal = real && real.rows.some((r) => r.kind === 'end' && r.n > 0);
    const data = hasReal ? real : { rows: sampleRows(), sample: true };
    body.replaceChildren(...render(data, lang));
  });
  return page;
}

function render(data, lang) {
  const labels = { table: t('ins.table'), chart: t('ins.chart') };
  const series = SERIES.map((k) => ({ key: k, label: t(`ins.series_${k}`) }));
  const rows = data.rows;
  const sum = (f) => rows.filter(f).reduce((a, r) => a + r.n, 0);
  const totalMatches = sum((r) => r.kind === 'end');
  const totalMoves = sum((r) => r.kind === 'move');
  const winRate = (mode, game) => {
    const f = (act) => sum((r) => r.kind === 'end' && r.mode === mode && r.act === act && (!game || r.game === game));
    const w = f('win'), n = w + f('lose') + f('draw');
    return n >= MIN_N ? { v: w / n, n } : null;
  };
  const oppName = (mode) => t(`ins.series_${oppOfMode[mode]}`);
  const fmtWin = (d) => (d ? `${Math.round(d.v * 100)}%` : '—');

  const out = [];
  if (data.sample) out.push(h('div.ins-sample', t('ins.sample')));
  else out.push(h('p.ins-updated.muted', t('ins.updated', { time: new Date(data.updated).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en') })));
  out.push(h('div.stats',
    statTile(t('ins.matches'), totalMatches.toLocaleString()),
    statTile(t('ins.moves'), totalMoves.toLocaleString()),
    ...['hinted', 'raw'].map((m) => { const d = winRate(m); return statTile(t('ins.humanWin'), fmtWin(d), t('ins.vs', { opp: oppName(m) })); }),
  ));

  for (const g of ['holdem', 'liarsdice', 'blotto', 'pd', 'rps', 'ultimatum']) {
    const gr = rows.filter((r) => r.game === g);
    if (!gr.length) continue;
    const cnt = (f) => gr.filter(f).reduce((a, r) => a + r.n, 0);
    const rate = (num, den) => (den >= MIN_N ? { v: num / den, n: den } : null);
    const bySeries = (se, f) => cnt((r) => seriesOf(r) === se.key && f(r));
    const present = series.filter((se) => gr.some((r) => seriesOf(r) === se.key));
    const charts = [];

    if (g === 'pd') {
      const xs = Array.from({ length: 10 }, (_, i) => ({ key: `r${i + 1}`, label: String(i + 1) }));
      charts.push(lineChart({ title: t('ins.pd_chart'), note: t('ins.pd_note'), xs, series: present, labels, minN: MIN_N,
        value: (x, se) => rate(bySeries(se, (r) => r.phase === x.key && r.act === 'C'), bySeries(se, (r) => r.phase === x.key)) }));
    }
    if (g === 'rps') {
      const cats = ['rock', 'paper', 'scissors'].map((k) => ({ key: k, label: t(`rps.${k}`) }));
      charts.push(groupedBars({ title: t('ins.rps_chart'), note: t('ins.rps_note'), cats, series: present, labels,
        value: (c, se) => rate(bySeries(se, (r) => r.act === c.key), bySeries(se, () => true)) }));
      const hits = present.filter((se) => se.key !== 'human').map((se) => { const d = rate(bySeries(se, (r) => r.detail === 'hit'), bySeries(se, (r) => r.detail === 'hit' || r.detail === 'miss')); return statTile(se.label, fmtWin(d), t('ins.rps_hit')); });
      if (hits.length) charts.push(h('div.stats.small', hits));
    }
    if (g === 'ultimatum') {
      const cats = Array.from({ length: 11 }, (_, o) => ({ key: `o${o}`, label: String(o) }));
      const prop = present.filter((se) => se.key !== 'bot' || gr.some((r) => seriesOf(r) === 'bot' && r.act.startsWith('o')));
      charts.push(groupedBars({ title: t('ins.ug_offer'), note: t('ins.ug_offer_note'), cats, series: prop, labels,
        value: (c, se) => rate(bySeries(se, (r) => r.act === c.key), bySeries(se, (r) => /^o\d+$/.test(r.act))) }));
      const xs = Array.from({ length: 11 }, (_, o) => ({ key: String(o), label: String(o) }));
      charts.push(lineChart({ title: t('ins.ug_accept'), note: t('ins.ug_accept_note'), xs, series: present, labels, minN: MIN_N,
        value: (x, se) => rate(bySeries(se, (r) => r.act === 'accept' && r.detail === x.key), bySeries(se, (r) => (r.act === 'accept' || r.act === 'reject') && r.detail === x.key)) }));
    }
    if (g === 'blotto') {
      const totals = {};
      gr.filter((r) => r.kind === 'move').forEach((r) => { totals[r.act] = (totals[r.act] || 0) + r.n; });
      const cats = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => ({ key: k, label: k.replace(/-/g, '·') }));
      charts.push(groupedBars({ title: t('ins.bl_chart'), note: t('ins.bl_note'), cats, series: present, labels,
        value: (c, se) => rate(bySeries(se, (r) => r.act === c.key), bySeries(se, (r) => r.kind === 'move')) }));
    }
    if (g === 'liarsdice') {
      const cats = [{ key: 'bluff', label: t('ins.ld_bluff') }, { key: 'liar', label: t('ins.ld_liar') }];
      charts.push(groupedBars({ title: t('ins.ld_chart'), note: t('ins.ld_note'), cats, series: present, labels,
        value: (c, se) => (c.key === 'bluff'
          ? rate(bySeries(se, (r) => r.act === 'bid' && r.detail === 'unlikely'), bySeries(se, (r) => r.act === 'bid'))
          : rate(bySeries(se, (r) => r.act === 'liar' && r.detail === 'right'), bySeries(se, (r) => r.act === 'liar'))) }));
    }
    if (g === 'holdem') {
      const aggr = (r) => ['bet', 'raise', 'allin'].includes(r.act);
      const cats = [{ key: 'aggr', label: t('ins.hd_aggr') }, { key: 'bluff', label: t('ins.hd_bluff') }, { key: 'fold', label: t('ins.hd_fold') }];
      charts.push(groupedBars({ title: t('ins.hd_chart'), note: t('ins.hd_note'), cats, series: present, labels,
        value: (c, se) => {
          const all = bySeries(se, (r) => r.kind === 'move');
          if (c.key === 'aggr') return rate(bySeries(se, aggr), all);
          if (c.key === 'fold') return rate(bySeries(se, (r) => r.act === 'fold'), all);
          return rate(bySeries(se, (r) => aggr(r) && r.detail === 'weak'), bySeries(se, aggr));
        } }));
    }

    const results = ['hinted', 'raw', 'practice'].map((m) => {
      const d = winRate(m, g);
      return d ? h('span.ins-win', h('i', { style: { background: `var(--s-${oppOfMode[m]})` } }), t('ins.vs', { opp: oppName(m) }), h('b', fmtWin(d)), h('small', `n=${d.n}`)) : null;
    });
    out.push(h('section.ins-game',
      h('div.ins-game-head',
        h('span.ins-icon', { html: gameIcon(g, 22) }),
        h('div', h('h2', t(`${g}.title`)), h('div.ins-wins', h('small.muted', t('ins.humanWin')), results))),
      h('div.ins-charts', charts),
    ));
  }
  return out;
}

function privacyCard() {
  const toggle = (key, label, note) => h('label.switch-row',
    h('input', { type: 'checkbox', checked: settings.get(key) === true || (key === 'share' && settings.get(key) !== false), onchange: (e) => settings.set(key, e.target.checked) }),
    h('span.switch'),
    h('span', h('b', label), note ? h('small.muted', note) : null));
  return h('section.privacy',
    h('h2', t('ins.privacy_t')),
    h('p', t('ins.privacy_b')),
    toggle('share', t('ins.share')),
    toggle('research', t('ins.research'), t('ins.research_note')),
  );
}
