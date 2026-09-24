// Heads-up Limit Texas Hold'em vs Jev. Blinds 1/2, fixed bets 2/2/4/4, cap of 4 bets per street,
// 200-chip stacks, play continues hand after hand until one side is broke.
// Pure rules/evaluator/equity live in ./holdem-core.js (Node-testable); this file is UI + flow.
// Module contract: see js/games/pd.js.

import { choiceAnswer, noulAnswer } from '../engine.js';
import {
  START_STACK, STREETS, newHand, legalActions, amountFor, applyAction, toCall, potSize,
  recordStats, emptyStats, makePayload, makeRawPayload, summarizeHand, bestFive, botPolicy, rankOf, suitOf,
} from './holdem-core.js';

const HUMAN = 0, JEV = 1;
const RECENT = 6; // finished hands remembered for Jev's raw payload

// Practice bot (automatic fallback when Jev is unreachable): equity / pot-odds mixed strategy.
function localBot(payload) {
  const b = botPolicy(payload);
  return {
    action: choiceAnswer(b.action),
    opp_bluffing: noulAnswer(b.opp_bluffing),
    ahead: noulAnswer(b.ahead),
  };
}

// ---------- artwork (static strings, never user data) ----------

const RANK_LABEL = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUIT_PATH = [
  // spade
  '<path d="M50 3C60 20 95 38 95 61c0 14-11 23-23 23-8 0-15-4-18-10 1 10 5 17 13 23H33c8-6 12-13 13-23-3 6-10 10-18 10C16 84 5 75 5 61 5 38 40 20 50 3z"/>',
  // heart
  '<path d="M50 92C22 68 4 51 4 30 4 15 15 5 29 5c9 0 17 5 21 13C54 10 62 5 71 5c14 0 25 10 25 25 0 21-18 38-46 62z"/>',
  // diamond
  '<path d="M50 2c9 17 22 33 38 48-16 15-29 31-38 48C41 81 28 65 12 50 28 35 41 19 50 2z"/>',
  // club
  '<circle cx="50" cy="27" r="20"/><circle cx="26" cy="57" r="20"/><circle cx="74" cy="57" r="20"/><circle cx="50" cy="52" r="12"/><path d="M45 56c0 18-5 30-14 40h38c-9-10-14-22-14-40z"/>',
];
const suitSvg = (s) => `<svg viewBox="0 0 100 100" aria-hidden="true" fill="currentColor">${SUIT_PATH[s]}</svg>`;
const SUIT_NAME = { en: ['spades', 'hearts', 'diamonds', 'clubs'], zh: ['黑桃', '红心', '方块', '梅花'] };

// Casino chip denominations: body colour, edge-spot colour, face colour.
const DENOMS = [
  { v: 100, body: '#1d1d23', dark: '#0b0b0e', spot: '#d8b76a', face: '#2a2a33' },
  { v: 25, body: '#1f6e48', dark: '#0f3a26', spot: '#f3eee2', face: '#26825a' },
  { v: 5, body: '#a92431', dark: '#5c1119', spot: '#f3eee2', face: '#bd3240' },
  { v: 1, body: '#ebe5d6', dark: '#a79f8c', spot: '#2c5aa6', face: '#f6f2e8' },
];
const CHIP_W = 32, CHIP_RX = 15, CHIP_RY = 5.6, CHIP_T = 4, MAX_COL = 9;

// A single side-view stack of n chips of one denomination.
function chipColumn(d, n) {
  const H = CHIP_RY * 2 + CHIP_T * n + 2;
  const cx = CHIP_W / 2;
  let g = '';
  for (let i = 0; i < n; i++) {
    const cy = H - 1 - CHIP_RY - CHIP_T * (i + 1); // centre of this chip's top face
    g += `<ellipse cx="${cx}" cy="${cy + CHIP_T}" rx="${CHIP_RX}" ry="${CHIP_RY}" fill="${d.dark}"/>`;
    g += `<rect x="${cx - CHIP_RX}" y="${cy}" width="${CHIP_RX * 2}" height="${CHIP_T}" fill="${d.body}"/>`;
    for (const x of [-11, -2.25, 6.5]) g += `<rect x="${cx + x}" y="${cy}" width="4.5" height="${CHIP_T}" fill="${d.spot}" opacity=".92"/>`;
    g += `<rect x="${cx - CHIP_RX}" y="${cy}" width="${CHIP_RX * 2}" height="${CHIP_T}" fill="url(#hd-side)"/>`;
    g += `<ellipse cx="${cx}" cy="${cy}" rx="${CHIP_RX}" ry="${CHIP_RY}" fill="${d.body}" stroke="rgba(0,0,0,.35)" stroke-width=".5"/>`;
    if (i === n - 1) {
      g += `<ellipse cx="${cx}" cy="${cy}" rx="${CHIP_RX - 1.6}" ry="${CHIP_RY - .7}" fill="none" stroke="${d.spot}" stroke-width="1.7" stroke-dasharray="4.2 3.4"/>`;
      g += `<ellipse cx="${cx}" cy="${cy}" rx="${CHIP_RX - 5}" ry="${CHIP_RY - 2}" fill="${d.face}" stroke="${d.spot}" stroke-width=".5" stroke-opacity=".6"/>`;
      g += `<ellipse cx="${cx - 3}" cy="${cy - 1.4}" rx="5" ry="1.2" fill="#fff" opacity=".18"/>`;
    }
  }
  return `<svg class="hd-col" viewBox="0 0 ${CHIP_W} ${H}" width="${CHIP_W}" height="${H}" aria-hidden="true">${g}</svg>`;
}

function chipStackHtml(amount) {
  let rest = amount;
  const cols = [];
  for (const d of DENOMS) {
    const n = Math.floor(rest / d.v);
    rest -= n * d.v;
    if (n) cols.push(chipColumn(d, Math.min(n, MAX_COL)));
  }
  return cols.join('');
}

// Shared gradient for the chip sides (referenced by url(#hd-side)).
const DEFS = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>'
  + '<linearGradient id="hd-side" x1="0" x2="1" y1="0" y2="0">'
  + '<stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset=".3" stop-color="#fff" stop-opacity=".12"/>'
  + '<stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/>'
  + '</linearGradient></defs></svg>';

const WORDMARK = '<svg viewBox="0 0 600 64" aria-hidden="true"><defs><path id="hd-arc" d="M30 8 Q300 74 570 8"/></defs>'
  + '<text><textPath href="#hd-arc" startOffset="50%" text-anchor="middle">JEV · GAME THEORY LAB</textPath></text></svg>';

const HAND_NAMES = {
  en: {
    hn_high_card: 'High card', hn_pair: 'One pair', hn_two_pair: 'Two pair', hn_trips: 'Three of a kind',
    hn_straight: 'Straight', hn_flush: 'Flush', hn_full_house: 'Full house', hn_quads: 'Four of a kind',
    hn_straight_flush: 'Straight flush', hn_royal_flush: 'Royal flush',
  },
  zh: {
    hn_high_card: '高牌', hn_pair: '一对', hn_two_pair: '两对', hn_trips: '三条',
    hn_straight: '顺子', hn_flush: '同花', hn_full_house: '葫芦', hn_quads: '四条',
    hn_straight_flush: '同花顺', hn_royal_flush: '皇家同花顺',
  },
};

export default {
  id: 'holdem',
  meta: { icon: '♠︎', accent: '#6366f1', minutes: 10 },
  strings: {
    en: {
      title: 'Heads-up Hold’em',
      tagline: 'Limit Texas Hold’em, one on one. Jev can’t see your cards, and you can’t see its. Bluff it, or catch it bluffing.',
      concept: 'Bluffing & imperfect information',
      rules: 'Limit hold’em, 200 virtual chips each, blinds 1/2. Bets are fixed: 2 before the flop and on the flop, 4 on the turn and river, at most 4 bets per street. The dealer button posts the small blind and switches every hand. Best five of seven cards wins. Play until someone is out of chips.',
      fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise',
      callN: 'Call {n}', betN: 'Bet {n}', raiseN: 'Raise to {n}',
      preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown',
      pot: 'Pot', hand: 'Hand {n}', dealer: 'Dealer button',
      yourTurn: 'Your move', toCall: '{n} to call', jevTurn: 'Jev is thinking',
      log: 'This hand', recent: 'Recent hands',
      l_sb: 'small blind {n}', l_bb: 'big blind {n}', l_check: 'checks', l_bet: 'bets {n}',
      l_call: 'calls {n}', l_raise: 'raises to {n}', l_fold: 'folds', allin: 'all-in',
      b_sb: 'Small blind {n}', b_bb: 'Big blind {n}', b_check: 'Check', b_bet: 'Bet {n}',
      b_call: 'Call {n}', b_raise: 'Raise to {n}', b_fold: 'Fold',
      winYou: 'You win {n}', winJev: 'Jev wins {n}',
      winYouHand: 'You win {n} with {hand}', winJevHand: 'Jev wins {n} with {hand}',
      split: 'Split pot: both have {hand}',
      byFoldYou: 'Jev folds', byFoldJev: 'You fold',
      nextHand: 'Next hand',
      bustJev: 'Jev is out of chips after {n} hands.',
      bustYou: 'You are out of chips after {n} hands.',
      q: 'Jev’s action ({street})',
      oppBluff: 'You are bluffing',
      jevAhead: 'Jev is ahead',
      virtual: 'Virtual chips · no real money',
      stakes: 'Blinds 1/2 · Limit 2/4',
      chips: '{n} virtual chips',
      net: 'Net {n}',
      mono: 'Y',
      facedown: 'Face-down card',
      card: '{rank} of {suit}',
      ...HAND_NAMES.en,
    },
    zh: {
      title: '单挑德州扑克',
      tagline: '一对一的限注德州扑克。Jev 看不到你的牌，你也看不到它的。去诈唬它，或者抓住它的诈唬。',
      concept: '诈唬与不完全信息',
      rules: '限注德州扑克，双方各 200 虚拟筹码，盲注 1/2。下注额固定：翻牌前和翻牌圈每注 2，转牌圈和河牌圈每注 4，每轮最多 4 注。庄家位下小盲，每手轮换。七张牌中取最好的五张比大小。打到一方筹码输光为止。',
      fold: '弃牌', check: '过牌', call: '跟注', bet: '下注', raise: '加注',
      callN: '跟注 {n}', betN: '下注 {n}', raiseN: '加注到 {n}',
      preflop: '翻牌前', flop: '翻牌圈', turn: '转牌圈', river: '河牌圈', showdown: '摊牌',
      pot: '底池', hand: '第 {n} 手', dealer: '庄家按钮',
      yourTurn: '轮到你了', toCall: '需跟注 {n}', jevTurn: 'Jev 思考中',
      log: '本手记录', recent: '最近几手',
      l_sb: '下小盲 {n}', l_bb: '下大盲 {n}', l_check: '过牌', l_bet: '下注 {n}',
      l_call: '跟注 {n}', l_raise: '加注到 {n}', l_fold: '弃牌', allin: '全下',
      b_sb: '小盲 {n}', b_bb: '大盲 {n}', b_check: '过牌', b_bet: '下注 {n}',
      b_call: '跟注 {n}', b_raise: '加注到 {n}', b_fold: '弃牌',
      winYou: '你赢得 {n}', winJev: 'Jev 赢得 {n}',
      winYouHand: '你以{hand}赢得 {n}', winJevHand: 'Jev 以{hand}赢得 {n}',
      split: '平分底池：双方都是{hand}',
      byFoldYou: 'Jev 弃牌', byFoldJev: '你弃牌',
      nextHand: '下一手',
      bustJev: '打了 {n} 手，Jev 的筹码输光了。',
      bustYou: '打了 {n} 手，你的筹码输光了。',
      q: 'Jev 的行动（{street}）',
      oppBluff: '你在诈唬',
      jevAhead: 'Jev 领先',
      virtual: '虚拟筹码 · 不涉及金钱',
      stakes: '盲注 1/2 · 限注 2/4',
      chips: '{n} 虚拟筹码',
      net: '净胜 {n}',
      mono: '你',
      facedown: '背面朝上的牌',
      card: '{suit} {rank}',
      ...HAND_NAMES.zh,
    },
  },

  mount(board, ctx) {
    const { t, h, panel } = ctx;
    const T = (k, v) => t(`holdem.${k}`, v);
    const lang = () => (t('holdem.mono') === '你' ? 'zh' : 'en');
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let alive = true;
    let gen = 0; // bumps on new game so stale async work is ignored
    const timers = new Set();
    let stacks, button, hand, stats, handNo, busy, over, past, results;

    const wait = (ms) => new Promise((resolve) => {
      const id = setTimeout(() => { timers.delete(id); resolve(); }, ms);
      timers.add(id);
    });

    // One-shot animations that survive re-renders: the first render of a key starts the clock,
    // later renders continue the same animation via a negative delay, then drop it.
    const born = new Map();
    function anim(key, cls, dur, delay = 0) {
      if (reduced) return null;
      const now = performance.now();
      if (!born.has(key)) born.set(key, now);
      const el = now - born.get(key);
      if (el > delay + dur) return null;
      return { cls, delay: `${Math.round(delay - el)}ms` };
    }
    const animAttrs = (a, extraCls = '') => ({
      class: [extraCls, a?.cls].filter(Boolean).join(' ') || null,
      style: a ? { animationDelay: a.delay } : null,
    });
    const settled = (key, dur) => reduced || (born.has(key) && performance.now() - born.get(key) > dur);

    function reset() {
      gen++;
      stacks = [START_STACK, START_STACK];
      button = HUMAN;
      stats = emptyStats();
      handNo = 0;
      past = [];
      results = [];
      over = false;
      busy = false;
      panel.waiting();
      startHand();
    }

    function startHand() {
      handNo++;
      born.clear();
      hand = newHand(stacks, button);
      busy = false;
      step();
    }

    function nextHand() {
      if (busy || over || !hand.done) return;
      button = 1 - button;
      startHand();
    }

    function step() {
      if (!alive) return;
      if (hand.done) {
        if (!hand.recorded) {
          hand.recorded = true;
          stacks = [...hand.stacks];
          over = stacks[HUMAN] === 0 || stacks[JEV] === 0;
          past.push(summarizeHand(hand, handNo));
          if (past.length > RECENT) past.shift();
          results.push({ n: handNo, winner: hand.result.winner, pot: hand.result.pot, showdown: hand.result.showdown });
          if (results.length > RECENT) results.shift();
        }
        busy = false;
        render();
        return;
      }
      if (hand.toAct === JEV) {
        busy = true;
        render();
        jevTurn();
      } else {
        busy = false;
        render();
      }
    }

    // `turn` is the move number the button was rendered for: a stale second click is ignored.
    function act(a, turn) {
      if (!alive || busy || hand.done || hand.toAct !== HUMAN || turn !== hand.history.length) return;
      if (!legalActions(hand).includes(a)) return;
      recordStats(stats, hand, a);
      applyAction(hand, a);
      step();
    }

    async function jevTurn() {
      const g = gen;
      const t0 = performance.now();
      panel.thinking();
      await wait(250);
      if (!alive || g !== gen) return;
      const cur = hand;
      const street = cur.street;
      const legal = legalActions(cur);
      const build = (mode) => (mode === 'raw' ? makeRawPayload(cur, JEV, past, handNo) : makePayload(cur, JEV, stats));
      let res;
      try {
        res = await ctx.decide('holdem', build, localBot);
      } catch (err) {
        console.warn('[holdem] decide failed, using practice bot', err);
        res = { answers: localBot(build('hinted')), model: 'practice bot', source: 'local', mode: 'hinted', ms: 0 };
      }
      if (!alive || g !== gen) return;
      const spent = performance.now() - t0;
      if (spent < 800) await wait(800 - spent); // let the deal animation breathe
      if (!alive || g !== gen) return;
      const a = ctx.pickAction(res.answers?.action, legal);
      panel.show(res, {
        labels: () => Object.fromEntries(legal.map((k) => [k, T(k)])),
        picked: a,
        title: () => T('q', { street: T(STREETS[street]) }),
        extras: () => [
          { label: T('oppBluff'), value: res.answers?.opp_bluffing?.noul },
          { label: T('jevAhead'), value: res.answers?.ahead?.noul },
        ],
      });
      recordStats(stats, cur, a);
      applyAction(cur, a);
      step();
    }

    // ---------- rendering ----------

    const who = (p) => (p === HUMAN ? t('you') : 'Jev');

    function cardLabel(c) {
      return T('card', { rank: RANK_LABEL[rankOf(c)], suit: SUIT_NAME[lang()][suitOf(c)] });
    }

    function face(c) {
      const r = rankOf(c), s = suitOf(c);
      const idx = (pos) => h(`span.hd-idx.${pos}`, h('span.hd-idx-r', RANK_LABEL[r]), h('span.hd-idx-s', { html: suitSvg(s) }));
      const court = r >= 9 && r <= 11;
      return h('span.hd-face', { class: `${s === 1 || s === 2 ? 'hd-red' : 'hd-black'}${r === 8 ? ' hd-ten' : ''}` },
        idx('tl'),
        court
          ? h('span.hd-court', h('span.hd-court-l', RANK_LABEL[r]), h('span.hd-court-s', { html: suitSvg(s) }))
          : h('span.hd-pip', { class: r === 12 ? 'hd-ace' : null, html: suitSvg(s) }),
        idx('br'),
      );
    }

    /**
     * A playing card. Face-down cards carry no face in the DOM (nothing to peek at).
     * opts: { down, a: movement anim on the card, flip: 3D turn anim on the inner, cls }
     * (Opacity animations must stay off the preserve-3d inner, or Chrome flattens it.)
     */
    function card(c, { down = false, a = null, flip = null, cls = '' } = {}) {
      const inner = h('span.hd-inner', animAttrs(flip, down ? 'hd-down' : ''),
        down ? null : face(c),
        h('span.hd-back'),
      );
      const at = animAttrs(a, cls);
      return h('span.hd-card', { ...at, role: 'img', 'aria-label': down ? T('facedown') : cardLabel(c) }, inner);
    }

    function chips(amount, cls, a, label = true) {
      if (!amount) return null;
      return h(`div.hd-chips.${cls}`, animAttrs(a),
        h('span.hd-stack', { html: chipStackHtml(amount) }),
        label ? h('span.hd-amt', amount) : null,
      );
    }

    // Each player's latest action on the current street, for the speech-bubble.
    function lastAction(p) {
      for (let i = hand.log.length - 1; i >= 0; i--) {
        const e = hand.log[i];
        if (e.street !== hand.street && !hand.done) break;
        if (e.who === p) return { e, i };
      }
      return null;
    }

    function winningCards() {
      const r = hand.result;
      if (!hand.done || !r.showdown) return null;
      const set = new Set();
      for (const p of r.winner === -1 ? [HUMAN, JEV] : [r.winner]) {
        for (const c of bestFive([...hand.holes[p], ...hand.board])) set.add(c);
      }
      return set;
    }

    function seat(p, win) {
      const r = hand.result;
      const showdown = hand.done && r.showdown;
      const folded = hand.done && !r.showdown && r.winner !== p;
      const top = p === JEV;
      const active = !hand.done && hand.toAct === p;
      const winner = hand.done && (r.winner === p || r.winner === -1);

      const holes = hand.holes[p].map((c, i) => {
        const down = p === JEV && !showdown;
        const delay = (i * 2 + (p === hand.button ? 0 : 1)) * 120;
        const a = anim(`deal${p}${i}`, top ? 'hd-a-deal-top' : 'hd-a-deal', 520, delay);
        const flip = p === JEV
          ? (showdown ? anim(`flip${i}`, 'hd-a-flip', 700, i * 110) : null)
          : anim(`turn${i}`, 'hd-a-flip', 520, delay + 260);
        const cls = win ? (win.has(c) ? 'hd-win' : 'hd-dim') : folded ? 'hd-muck' : '';
        return card(c, { down, a, flip, cls });
      });

      let bubble = null;
      if (showdown) {
        const hn = anim(`hn${p}`, 'hd-a-pop', 420, 600);
        bubble = h('div.hd-bubble.hd-hn', animAttrs(hn, winner ? 'hd-best' : ''), T(`hn_${r.names[p]}`));
      } else if (active && p === JEV && busy) {
        bubble = h('div.hd-bubble.hd-think', { 'aria-label': T('jevTurn') }, h('i'), h('i'), h('i'));
      } else {
        const la = lastAction(p);
        if (la && (!hand.done || la.e.act === 'fold')) {
          const { e, i } = la;
          const a = anim(`b${i}`, 'hd-a-pop', 380);
          bubble = h('div.hd-bubble', animAttrs(a, `hd-b-${e.act}`),
            T(`b_${e.act}`, { n: e.amount }),
            e.allin ? h('span.hd-b-allin', T('allin')) : null,
          );
        }
      }

      const stack = hand.stacks[p];
      return h(`div.hd-seat.${top ? 'hd-seat-top' : 'hd-seat-bottom'}`, { class: `${active ? 'hd-on' : ''}${winner && hand.done ? ' hd-won' : ''}` },
        h('div.hd-hole', holes),
        h('div.hd-plate-wrap',
          hand.button === p ? h('span.hd-puck', { title: T('dealer'), 'aria-label': T('dealer') }, 'D') : null,
          h('div.hd-plate',
            h('span.hd-ava', { class: p === JEV ? 'hd-ava-jev' : 'hd-ava-you' }, p === JEV ? 'J' : T('mono')),
            h('span.hd-pinfo',
              h('b.hd-pname', who(p)),
              h('span.hd-pstack', { title: T('chips', { n: stack }) }, h('i.hd-coin'), stack),
            ),
          ),
          bubble,
        ),
      );
    }

    function resultText() {
      const r = hand.result;
      if (r.winner === -1) return T('split', { hand: T(`hn_${r.names[0]}`) });
      if (r.showdown) return T(r.winner === HUMAN ? 'winYouHand' : 'winJevHand', { n: r.pot, hand: T(`hn_${r.names[r.winner]}`) });
      return T(r.winner === HUMAN ? 'winYou' : 'winJev', { n: r.pot });
    }

    function centre(win) {
      const r = hand.result;
      const slots = Array.from({ length: 5 }, (_, i) => {
        const c = hand.board[i];
        if (c == null) return h('span.hd-card.hd-slot');
        const delay = (i < 3 ? i : 0) * 140 + 120;
        const a = anim(`board${i}`, 'hd-a-board', 420, delay);
        const flip = anim(`bflip${i}`, 'hd-a-flip', 560, delay + 180);
        return card(c, { a, flip, cls: win ? (win.has(c) ? 'hd-win' : 'hd-dim') : '' });
      });
      const collected = hand.done ? r.pot : potSize(hand) - hand.contrib[0] - hand.contrib[1];
      let top;
      if (hand.done) {
        const dur = 900;
        const potA = anim('potwin', r.winner === JEV ? 'hd-a-to-top' : r.winner === HUMAN ? 'hd-a-to-bottom' : 'hd-a-fade', dur, r.showdown ? 900 : 250);
        const banner = anim('banner', 'hd-a-banner', 500, r.showdown ? 1100 : 350);
        top = h('div.hd-potrow',
          !settled('potwin', dur + (r.showdown ? 900 : 250)) ? chips(collected, 'hd-pot', potA, false) : null,
          h('div.hd-banner', animAttrs(banner, r.winner === HUMAN ? 'hd-good' : r.winner === JEV ? 'hd-bad' : ''),
            h('span.hd-banner-k', r.showdown ? T('showdown') : T(r.winner === HUMAN ? 'byFoldYou' : 'byFoldJev')),
            h('b', resultText()),
          ),
        );
      } else {
        const potA = anim(`pot${collected}`, 'hd-a-gather', 450);
        top = h('div.hd-potrow',
          chips(collected, 'hd-pot', potA, false),
          h('span.hd-potlabel', T('pot'), ' ', h('b', potSize(hand))),
        );
      }
      return h('div.hd-centre', top, h('div.hd-board', slots), h('div.hd-mark', { html: WORDMARK }));
    }

    function betRow(p) {
      const amt = hand.done ? 0 : hand.contrib[p];
      const a = anim(`bet${hand.street}${p}${amt}`, p === JEV ? 'hd-a-bet-top' : 'hd-a-bet', 380);
      return h(`div.hd-betrow.${p === JEV ? 'hd-bet-top' : 'hd-bet-bottom'}`, chips(amt, 'hd-bet', a));
    }

    function hud() {
      const net = (hand.done ? hand.stacks[HUMAN] : hand.stacks[HUMAN] + hand.total[HUMAN]) - START_STACK;
      const cur = hand.done && hand.result.showdown ? 4 : hand.street;
      const names = [...STREETS.map((s) => T(s)), T('showdown')];
      return h('div.hd-hud',
        h('div.hd-hud-l', h('span.hd-hud-hand', T('hand', { n: handNo })),
          h('span.hd-net', { class: net > 0 ? 'hd-up' : net < 0 ? 'hd-down' : '' }, T('net', { n: net > 0 ? `+${net}` : net }))),
        h('ol.hd-streets', names.map((s, i) => h('li', { class: i === cur ? 'hd-cur' : i < cur ? 'hd-past' : '' }, s))),
        h('div.hd-hud-r', T('stakes')),
      );
    }

    function controls() {
      if (over) {
        const won = stacks[HUMAN] > 0;
        return h('div.hd-bar.hd-bar-over',
          h('div.hd-over', h('h2', t(won ? 'result.win' : 'result.lose')), h('p.muted', T(won ? 'bustJev' : 'bustYou', { n: handNo }))),
          h('button.hd-act.hd-act-gold', { type: 'button', onclick: reset }, t('new.game')),
        );
      }
      if (hand.done) {
        const r = hand.result;
        return h('div.hd-bar',
          h('p.hd-say', { class: r.winner === HUMAN ? 'hd-good' : r.winner === JEV ? 'hd-bad' : '' }, resultText()),
          h('div.hd-btns', h('button.hd-act.hd-act-gold', { type: 'button', onclick: nextHand }, T('nextHand'))),
        );
      }
      if (hand.toAct === JEV) {
        return h('div.hd-bar',
          h('p.hd-say.hd-wait', T('jevTurn'), h('span.hd-dots', h('i'), h('i'), h('i'))),
          h('div.hd-btns', ['fold', 'call', 'raise'].map((k) => h('button.hd-act.hd-ghost', { type: 'button', disabled: true, 'aria-hidden': 'true', tabindex: '-1' }, T(k)))),
        );
      }
      const legal = legalActions(hand);
      const tc = toCall(hand);
      const turn = hand.history.length;
      const label = (a) => {
        if (a === 'call') return [T('call'), amountFor(hand, a)];
        if (a === 'bet') return [T('bet'), amountFor(hand, a)];
        if (a === 'raise') return [T('raiseN', { n: '' }).trim(), hand.contrib[HUMAN] + amountFor(hand, a)];
        return [T(a), null];
      };
      const cls = { fold: 'hd-act-fold', check: 'hd-act-plain', call: 'hd-act-plain', bet: 'hd-act-gold', raise: 'hd-act-gold' };
      return h('div.hd-bar',
        h('p.hd-say', T('yourTurn'), tc > 0 ? h('span.hd-tocall', T('toCall', { n: Math.min(tc, hand.stacks[HUMAN]) })) : null),
        h('div.hd-btns', legal.map((a) => {
          const [k, n] = label(a);
          return h(`button.hd-act.${cls[a]}`, { type: 'button', disabled: busy, onclick: () => act(a, turn) },
            h('span', k), n != null ? h('b.hd-act-n', n) : null);
        })),
      );
    }

    function logLine(e) {
      return h('li', { class: e.who === JEV ? 'hd-jev' : 'hd-you' },
        h('span.hd-lstreet', T(STREETS[e.street])),
        h('b', who(e.who)), ' ',
        T(`l_${e.act}`, { n: e.amount }),
        e.allin ? h('span.hd-allin', T('allin')) : null,
      );
    }

    function recentList() {
      if (!results.length) return null;
      return h('div.hd-recent',
        h('div.hd-log-title', T('recent')),
        h('ol', results.slice().reverse().map((x) => h('li', { class: x.winner === HUMAN ? 'hd-good' : x.winner === JEV ? 'hd-bad' : '' },
          h('span.hd-lstreet', `#${x.n}`),
          h('b', x.winner === -1 ? '=' : who(x.winner)),
          x.winner === -1 ? ` ${x.pot / 2}` : ` +${x.pot / 2}`,
          h('span.hd-lstreet', x.showdown ? T('showdown') : T('fold')),
        ))),
      );
    }

    function render() {
      if (!alive) return;
      const win = winningCards();
      board.replaceChildren(
        h('div.hd-root', { class: hand.done ? 'hd-done' : '' },
          h('span.hd-defs', { html: DEFS }),
          hud(),
          h('div.hd-table',
            h('div.hd-felt',
              seat(JEV, win),
              betRow(JEV),
              centre(win),
              betRow(HUMAN),
              seat(HUMAN, win),
            ),
          ),
          h('p.hd-virtual', T('virtual')),
          controls(),
          h('div.hd-logs',
            h('div.hd-log',
              h('div.hd-log-title', T('log')),
              h('ol', hand.log.map(logLine)),
            ),
            recentList(),
          ),
        ),
      );
    }

    reset();
    return {
      render,
      destroy() {
        alive = false;
        gen++;
        timers.forEach(clearTimeout);
        timers.clear();
      },
    };
  },
};
