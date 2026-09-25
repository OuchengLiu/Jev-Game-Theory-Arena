// Insights page: public, aggregate statistics of how people and Jev play.
// Data: GET <proxy>/stats (pre-aggregated counts, cached 5 min). Only real games are counted;
// a game with no records yet shows empty charts.

import { t, registerStrings } from './i18n.js';
import { settings } from './settings.js';
import { CONFIG } from './config.js';
import { h, segmented } from './ui.js';
import { groupedBars, lineChart, statTile } from './charts.js';
import { gameIcon } from './icons.js';

const MIN_N = 10; // below this, marks are drawn faded and flagged as a small sample

registerStrings('ins', {
  en: {
    title: 'Insights',
    lead: 'How do people play compared with Jev? Every chart below counts real, anonymous games played on this site and updates every few minutes.',
    none: 'No games recorded yet. Charts fill in as people play.',
    updated: 'Updated {time}',
    matches: 'Matches played', moves: 'Moves recorded', humanWin: 'Human win rate',
    vs: 'vs {opp}',
    series_human: 'Humans', 'series_jev-hinted': 'Jev · Hinted', 'series_jev-raw': 'Jev · Raw', series_bot: 'Practice bot',
    table: 'Table', chart: 'Chart',
    version: 'Version', v_latest: 'Current', v_all: 'All versions',
    v_latest_note: 'Showing each game’s current version only.', v_all_note: 'Includes earlier game versions, whose prompts differed.',
    low: 'small sample', low_note: 'Faded marks are based on fewer than {n} records; * marks a small-sample rate.',
    pd_chart: 'Cooperation rate by round', pd_note: 'Share of players who cooperated in each round. Watch for end-game defection in the last rounds.',
    rps_chart: 'Throw mix', rps_note: 'The Nash equilibrium is exactly 1/3 each. Any tilt away from it can be exploited.',
    rps_hit: 'How often it guessed your next throw', empty: 'No records for this chart yet.',
    ug_offer: 'Offers made by proposers', ug_offer_note: 'Coins offered to the other side (out of 10).',
    ug_accept: 'Acceptance rate by offer size', ug_accept_note: 'Game theory says accept anything above 0. People usually don’t.',
    bl_chart: 'Most common splits', bl_note: 'Soldiers per field, sorted high to low, regardless of which field got what.',
    ld_chart: 'Bluffing and challenging', ld_bluff: 'Bluff rate', ld_liar: 'Correct “Liar!” calls',
    ld_note: 'Bluff rate: share of bids that were unlikely to be true given the bidder’s own dice.',
    hd_chart: 'Playing style', hd_aggr: 'Aggression', hd_bluff: 'Bluffs among bets', hd_fold: 'Fold rate',
    hd_note: 'Aggression: bets and raises (including all-in ones) as a share of all actions; calling an all-in is a call. Bluffs: aggressive actions made with a weak hand.',
    cal_t: 'Is Jev calibrated?',
    cal_b: 'Jev claims its probabilities are calibrated: when it says 70%, it should be right about 70% of the time. Each game asks it a yes/no question we can check afterwards (will you cooperate, are you bluffing, is it ahead, will you stack a field, will its predicted throw be right). The dashed line is perfect calibration.',
    cal_chart: 'Stated probability vs how often it came true',
    cal_x: 'stated',
    cal_ref: 'perfect',
    cal_err: 'Average calibration error',
    cal_err_sub: '{s} · lower is better',
    pd_ret: 'Retaliation & forgiveness', pd_ret_note: 'After the other side defected: defect back (retaliate) or cooperate anyway (forgive). Unprovoked: defecting after the other side cooperated.',
    pd_retaliate: 'Retaliate', pd_forgive: 'Forgive', pd_unprovoked: 'Unprovoked defection',
    rps_first: 'Round 1: what people throw vs what Jev predicts', rps_first_note: 'Human bars: actual first throws. Jev bars: what Jev predicted the first throw would be.',
    privacy_t: 'Your data, your choice',
    privacy_b: 'We record moves (for example “round 3: cooperated”), never who made them. There is no IP address, account, device fingerprint or free text. Each match gets a random id, and each browser a random player number, neither linked to who you are. Nothing is ever sold, and only the aggregate charts on this page are published.',
    share: 'Contribute anonymous gameplay statistics, and agree to their use in possible further analysis and research in the future',
    terms: 'The statistics on this page are © the Jev Game Theory Lab authors, all rights reserved. You are welcome to view and discuss them; copying, scraping, re-analysing or using them in research or publications requires our permission first (see LICENSE).',
    research: 'Also allow my anonymous data to be used in academic research',
    offline: 'Statistics aren’t available yet.',
  },
  zh: {
    title: '数据洞察',
    lead: '人类和 Jev 的打法有什么不同？下面的每张图都统计自本站真实的匿名对局，每隔几分钟更新一次。',
    none: '还没有对局记录，大家玩起来之后图表会逐渐填满。',
    updated: '更新于 {time}',
    matches: '对局数', moves: '记录的出招数', humanWin: '人类胜率',
    vs: '对 {opp}',
    series_human: '人类', 'series_jev-hinted': 'Jev · 提示模式', 'series_jev-raw': 'Jev · 直觉模式', series_bot: '练习机器人',
    table: '表格', chart: '图表',
    version: '版本', v_latest: '当前版本', v_all: '全部版本',
    v_latest_note: '只显示各游戏当前版本的数据。', v_all_note: '包含旧版本的数据，旧版本的提示词与现在不同。',
    low: '样本较少', low_note: '浅色的柱子和点背后不足 {n} 条记录；数字后的 * 表示样本较少。',
    pd_chart: '各回合的合作率', pd_note: '每一回合选择合作的比例。留意最后几回合的“终局背叛”。',
    rps_chart: '出拳分布', rps_note: '纳什均衡恰好是各 1/3，任何偏离都可能被针对。',
    rps_hit: '猜中你下一手的比例', empty: '这张图还没有记录。',
    ug_offer: '提议者的出价分布', ug_offer_note: '分给对方的金币数（满分 10）。',
    ug_accept: '不同出价的接受率', ug_accept_note: '博弈论说只要大于 0 就该接受，但人往往不这么做。',
    bl_chart: '最常见的兵力分配', bl_note: '各战场兵力从高到低排列，不区分具体是哪个战场。',
    ld_chart: '诈唬与开牌', ld_bluff: '诈唬率', ld_liar: '“开！”的正确率',
    ld_note: '诈唬率：按叫点者自己的骰子来看，不太可能成立的叫点所占比例。',
    hd_chart: '打法风格', hd_aggr: '激进度', hd_bluff: '下注中的诈唬比例', hd_fold: '弃牌率',
    hd_note: '激进度：下注和加注（含全下式的下注、加注）占全部动作的比例；跟注对方的全下算跟注。诈唬：拿着弱牌做出的激进动作。',
    cal_t: 'Jev 的概率准吗？',
    cal_b: 'Jev 声称它给出的概率是校准过的：说 70% 的事，应该大约 70% 的时候成真。每个游戏都会问它一个事后能核对的是非题（你会不会合作、你是不是在诈唬、它是否领先、你会不会重兵压一个战场、它预测的出拳是否猜中）。虚线表示完美校准。',
    cal_chart: 'Jev 给出的概率 vs 实际成真的比例',
    cal_x: '给出的概率',
    cal_ref: '完美校准',
    cal_err: '平均校准误差',
    cal_err_sub: '{s} · 越低越好',
    pd_ret: '报复与原谅', pd_ret_note: '对方上一轮背叛后：回以背叛（报复），还是继续合作（原谅）。无故背叛：对方上一轮合作，自己却背叛。',
    pd_retaliate: '报复', pd_forgive: '原谅', pd_unprovoked: '无故背叛',
    rps_first: '第 1 回合：人类实际出什么 vs Jev 预测你出什么', rps_first_note: '人类的柱子是实际的第一拳，Jev 的柱子是它预测的第一拳。',
    privacy_t: '你的数据，由你决定',
    privacy_b: '我们只记录出招（例如“第 3 回合：合作”），从不记录是谁出的招：没有 IP、账号、设备指纹或任何自由文本。每局对局有一个随机 ID，每个浏览器有一个随机的玩家编号，都和你的身份无关。数据绝不出售，公开的只有本页的汇总图表。',
    share: '贡献匿名对局统计，并同意用于未来可能的进一步分析与研究',
    terms: '本页统计数据由 Jev 博弈实验室作者保留所有权利。欢迎浏览和讨论；转载、抓取、重新分析或用于研究发表，均需事先征得我们同意（见 LICENSE）。',
    research: '同时允许我的匿名数据用于学术研究',
    offline: '统计数据暂时不可用。',
  },
}, { game: false });

const SERIES = ['human', 'jev-raw', 'jev-hinted', 'bot'];
const JEV_MODES = ['hinted', 'raw'];
// Humans: only while playing against Jev (hinted or raw) — humans facing the practice bot are a
// different condition. Jev: per mode. Practice bot: every bot move (practice mode, and the bot
// standing in while Jev was unavailable in older data); the play policy never affects it.
const seriesOf = (r) => {
  if (r.actor === 'human') return JEV_MODES.includes(r.mode) ? 'human' : null;
  if (r.actor === 'jev') return JEV_MODES.includes(r.mode) ? `jev-${r.mode}` : null;
  return r.actor === 'bot' ? 'bot' : null;
};
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
  // Jev's two play policies are analysed separately, never mixed. Rows from before policies
  // existed were all played "by odds".
  let policy = 'greedy';
  let version = 'latest';
  const cmpVer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
  const draw = (data) => {
    const latest = {};
    for (const r of data.rows) if (!latest[r.game] || cmpVer(r.game_ver, latest[r.game]) > 0) latest[r.game] = r.game_ver;
    // practice rows and bot moves carry no meaningful policy; rows without one predate policies ('sample')
    const rows = data.rows.filter((r) => (r.mode === 'practice' || r.actor === 'bot' || (r.policy || 'sample') === policy)
      && (version === 'all' || r.game_ver === latest[r.game]));
    body.replaceChildren(
      h('div.ins-filter',
        h('span', t('policy.label')),
        segmented([{ value: 'greedy', label: t('policy.greedy') }, { value: 'sample', label: t('policy.sample') }], policy, (v) => { policy = v; draw(data); }),
        h('span', t('ins.version')),
        segmented([{ value: 'latest', label: t('ins.v_latest') }, { value: 'all', label: t('ins.v_all') }], version, (v) => { version = v; draw(data); }),
        h('small.muted', t(`policy.info.${policy}`), ' ', t(version === 'latest' ? 'ins.v_latest_note' : 'ins.v_all_note'))),
      ...render({ ...data, rows }, lang));
  };
  loadStats().then((data) => {
    if (data) draw(data);
    else body.replaceChildren(h('p.ins-empty', t('ins.offline')));
  });
  return page;
}

function render(data, lang) {
  const labels = { table: t('ins.table'), chart: t('ins.chart'), low: t('ins.low'), lowNote: t('ins.low_note', { n: MIN_N }), lowN: MIN_N, empty: t('ins.empty') };
  const series = SERIES.map((k) => ({ key: k, label: t(`ins.series_${k}`) }));
  const rows = data.rows;
  const sum = (f) => rows.filter(f).reduce((a, r) => a + r.n, 0);
  const totalMatches = sum((r) => r.kind === 'end');
  const totalMoves = sum((r) => r.kind === 'move' && r.detail !== 'pred');
  const winRate = (mode, game) => {
    const f = (act) => sum((r) => r.kind === 'end' && r.mode === mode && r.act === act && (!game || r.game === game));
    const w = f('win'), n = w + f('lose') + f('draw');
    return n >= 1 ? { v: w / n, n } : null;
  };
  const oppName = (mode) => t(`ins.series_${oppOfMode[mode]}`);
  const fmtWin = (d) => (d ? `${Math.round(d.v * 100)}%${d.n < MIN_N ? '*' : ''}` : '—');

  const out = [];
  out.push(h('p.ins-updated.muted', t('ins.updated', { time: new Date(data.updated).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en') })));
  out.push(h('div.stats',
    statTile(t('ins.matches'), totalMatches.toLocaleString()),
    statTile(t('ins.moves'), totalMoves.toLocaleString()),
    ...['raw', 'hinted'].map((m) => { const d = winRate(m); return statTile(t('ins.humanWin'), fmtWin(d), t('ins.vs', { opp: oppName(m) })); }),
  ));

  out.push(calibrationSection(rows, series, labels));

  for (const g of ['holdem', 'liarsdice', 'blotto', 'pd', 'rps', 'ultimatum']) {
    const all = rows.filter((r) => r.game === g);
    const gr = all.filter((r) => r.kind === 'move' && r.detail !== 'pred');
    const preds = all.filter((r) => r.kind === 'move' && r.detail === 'pred');
    const cnt = (f) => gr.filter(f).reduce((a, r) => a + r.n, 0);
    const rate = (num, den) => (den >= 1 ? { v: num / den, n: den } : null);
    const bySeries = (se, f) => cnt((r) => seriesOf(r) === se.key && f(r));
    const withData = series.filter((se) => gr.some((r) => seriesOf(r) === se.key));
    const present = withData.length ? withData : series; // empty charts still show the full legend
    const charts = [];

    if (g === 'pd') {
      const xs = Array.from({ length: 10 }, (_, i) => ({ key: `r${i + 1}`, label: String(i + 1) }));
      charts.push(lineChart({ title: t('ins.pd_chart'), note: t('ins.pd_note'), xs, series: present, labels, minN: 1,
        value: (x, se) => rate(bySeries(se, (r) => r.phase === x.key && r.act === 'C'), bySeries(se, (r) => r.phase === x.key)) }));
    }
    if (g === 'pd') {
      const cats = [{ key: 'ret', label: t('ins.pd_retaliate') }, { key: 'forg', label: t('ins.pd_forgive') }, { key: 'unp', label: t('ins.pd_unprovoked') }];
      charts.push(groupedBars({ title: t('ins.pd_ret'), note: t('ins.pd_ret_note'), cats, series: present, labels,
        value: (c, se) => {
          const afterD = bySeries(se, (r) => r.detail === 'after_D');
          if (c.key === 'ret') return rate(bySeries(se, (r) => r.detail === 'after_D' && r.act === 'D'), afterD);
          if (c.key === 'forg') return rate(bySeries(se, (r) => r.detail === 'after_D' && r.act === 'C'), afterD);
          return rate(bySeries(se, (r) => r.detail === 'after_C' && r.act === 'D'), bySeries(se, (r) => r.detail === 'after_C'));
        } }));
    }
    if (g === 'rps') {
      const cats = ['rock', 'paper', 'scissors'].map((k) => ({ key: k, label: t(`rps.${k}`) }));
      charts.push(groupedBars({ title: t('ins.rps_chart'), note: t('ins.rps_note'), cats, series: present, labels,
        value: (c, se) => rate(bySeries(se, (r) => r.act === c.key), bySeries(se, () => true)) }));
      const firstSeries = series.filter((se) => se.key !== 'bot');
      const first = (c, se) => (se.key === 'human'
        ? rate(bySeries(se, (r) => r.phase === 'r1' && r.act === c.key), bySeries(se, (r) => r.phase === 'r1'))
        : rate(preds.filter((r) => seriesOf(r) === se.key && r.phase === 'r1' && r.act === c.key).reduce((a, r) => a + r.n, 0), preds.filter((r) => seriesOf(r) === se.key && r.phase === 'r1').reduce((a, r) => a + r.n, 0)));
      charts.push(groupedBars({ title: t('ins.rps_first'), note: t('ins.rps_first_note'), cats, series: firstSeries, labels, value: first }));
      const hits = withData.filter((se) => se.key !== 'human').map((se) => { const d = rate(bySeries(se, (r) => r.detail === 'hit'), bySeries(se, (r) => r.detail === 'hit' || r.detail === 'miss')); return statTile(se.label, fmtWin(d), t('ins.rps_hit')); });
      if (hits.length) charts.push(h('div.stats.small', hits));
    }
    if (g === 'ultimatum') {
      const cats = Array.from({ length: 11 }, (_, o) => ({ key: `o${o}`, label: String(o) }));
      const prop = present.filter((se) => se.key !== 'bot' || gr.some((r) => seriesOf(r) === 'bot' && r.act.startsWith('o')));
      charts.push(groupedBars({ title: t('ins.ug_offer'), note: t('ins.ug_offer_note'), cats, series: prop, labels,
        value: (c, se) => rate(bySeries(se, (r) => r.act === c.key), bySeries(se, (r) => /^o\d+$/.test(r.act))) }));
      const xs = Array.from({ length: 11 }, (_, o) => ({ key: String(o), label: String(o) }));
      charts.push(lineChart({ title: t('ins.ug_accept'), note: t('ins.ug_accept_note'), xs, series: present, labels, minN: 1,
        value: (x, se) => rate(bySeries(se, (r) => r.act === 'accept' && r.detail === x.key), bySeries(se, (r) => (r.act === 'accept' || r.act === 'reject') && r.detail === x.key)) }));
    }
    if (g === 'blotto') {
      const totals = {};
      gr.filter((r) => seriesOf(r)).forEach((r) => { totals[r.act] = (totals[r.act] || 0) + r.n; });
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

    const results = ['raw', 'hinted', 'practice'].map((m) => {
      const d = winRate(m, g);
      return d ? h('span.ins-win', h('i', { style: { background: `var(--s-${oppOfMode[m]})` } }), t('ins.vs', { opp: oppName(m) }), h('b', fmtWin(d)), h('small', `n=${d.n}`)) : null;
    });
    out.push(h('section.ins-game',
      h('div.ins-game-head',
        h('span.ins-icon', { html: gameIcon(g, 22) }),
        h('div', h('h2', t(`${g}.title`)), h('div.ins-wins', h('small.muted', t('ins.humanWin')), results))),
      all.length ? null : h('p.ins-none', t('ins.none')),
      h('div.ins-charts', charts),
    ));
  }
  return out;
}

function calibrationSection(rows, series, labels) {
  const cal = rows.filter((r) => r.kind === 'cal');
  const calSeries = series.filter((se) => se.key !== 'human');
  const xs = Array.from({ length: 10 }, (_, i) => ({ key: `p${i}`, label: `${i * 10}–${i * 10 + 10}%` }));
  const count = (se, f) => cal.filter((r) => seriesOf(r) === se.key && f(r)).reduce((a, r) => a + r.n, 0);
  const value = (x, se) => {
    const n = count(se, (r) => r.act === x.key);
    return n >= 1 ? { v: count(se, (r) => r.act === x.key && r.detail === 'yes') / n, n } : null;
  };
  // expected calibration error: bucket-size-weighted |observed − bucket midpoint|
  const ece = (se) => {
    const total = count(se, () => true);
    if (!total) return null;
    let err = 0;
    xs.forEach((x, i) => { const n = count(se, (r) => r.act === x.key); if (n) err += (n / total) * Math.abs(count(se, (r) => r.act === x.key && r.detail === 'yes') / n - (i + 0.5) / 10); });
    return { v: err, n: total };
  };
  return h('section.ins-cal',
    h('h2', t('ins.cal_t')),
    h('p', t('ins.cal_b')),
    h('div.stats.small', calSeries.map((se) => { const d = ece(se); return statTile(t('ins.cal_err'), d ? `${(d.v * 100).toFixed(1)} pp${d.n < MIN_N * 3 ? '*' : ''}` : '—', t('ins.cal_err_sub', { s: se.label })); })),
    h('div.ins-charts', lineChart({ title: t('ins.cal_chart'), xs, series: calSeries, labels, value, minN: 1,
      ref: xs.map((_, i) => (i + 0.5) / 10), refLabel: t('ins.cal_ref') })),
  );
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
    h('p.ins-terms', t('ins.terms')),
  );
}
