// Heads-up No-Limit Texas Hold'em vs Jev. Blinds 1/2, 200-chip stacks (100 big blinds), any bet
// from the big blind up to all-in, play continues hand after hand until one side is broke.
// Jev picks among discrete sizes (see holdem-core.js sizeOptions); the human gets quick-size chips,
// a slider and an All-in button.
// Pure rules/evaluator/equity live in ./holdem-core.js (Node-testable); this file is UI + flow.
// Module contract: see js/games/pd.js.

import { choiceAnswer, noulAnswer } from '../engine.js';
import {
  START_STACK, STREETS, newHand, legalActions, amountFor, applyAction, toCall, potSize, raiseRange, jevOptions,
  potFractionTo, clampTo, recordStats, emptyStats, makePayload, makeRawPayload, summarizeHand, bestFive, botPolicy,
  rankOf, suitOf, equity, evaluate,
} from './holdem-core.js';

const HUMAN = 0, JEV = 1;
const RECENT = 6; // finished hands remembered for Jev's record (both modes)
// Human quick-size chips: fraction of the pot (a raise adds this fraction of the pot after calling).
const QUICK = [['q33', 1 / 3], ['q50', 1 / 2], ['q75', 3 / 4], ['q100', 1], ['q200', 2]];

// All-in run-out: Jev's cards flip first, then the missing board cards one street at a time.
function runoutPlan(from) {
  const d = {};
  let t = 700;
  for (let i = from; i < 5; i++) { d[i] = t; t += i < 2 ? 140 : 900; }
  return { d, end: d[4] + 700 };
}

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
// Small crown ornament above a court card's letter.
const CROWN = '<svg viewBox="0 0 40 22" aria-hidden="true" fill="currentColor"><path d="M3 7l8 6 9-11 9 11 8-6-3 12H6z"/><rect x="6" y="19.5" width="28" height="2.5" rx="1"/></svg>';
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
  meta: { icon: '♠︎', accent: '#6366f1', minutes: 8, version: '2.3' },
  strings: {
    en: {
      title: 'Heads-up No-Limit Hold’em',
      tagline: 'No-Limit Texas Hold’em, one on one. Any bet up to all-in: size it right, bluff Jev off its hand, or catch it bluffing.',
      concept: 'Bluffing, bet sizing & imperfect information',
      rules: 'No-limit hold’em, 200 virtual chips each (100 big blinds), blinds 1/2. Bet any amount from the big blind up to all of your chips; a raise must be at least as big as the previous bet or raise, except that you may always go all-in. The dealer button posts the small blind, acts first before the flop and last after it, and switches every hand. When a player is all-in and called, the remaining cards are dealt out. Best five of seven cards wins. Play until someone is out of chips.',
      fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise', allinBtn: 'All-in',
      callN: 'Call {n}', betN: 'Bet {n}', raiseN: 'Raise to {n}', allinN: 'All-in {n}',
      betTo: 'Bet', raiseTo: 'Raise to', size: 'Bet size', minN: 'Min {n}', maxN: 'All-in {n}',
      q33: '1/3', q50: '1/2', q75: '3/4', q100: 'Pot', q200: '2×', qAll: 'All-in',
      q33t: 'One third of the pot', q50t: 'Half the pot', q75t: 'Three quarters of the pot', q100t: 'The size of the pot', q200t: 'Twice the pot',
      runout: 'All-in: dealing the rest of the board',
      preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown',
      pot: 'Pot', hand: 'Hand {n}', dealer: 'Dealer button',
      yourTurn: 'Your move', toCall: '{n} to call', jevTurn: 'Jev is thinking',
      log: 'This hand', recent: 'Recent hands',
      l_sb: 'small blind {n}', l_bb: 'big blind {n}', l_check: 'checks', l_bet: 'bets {n}',
      l_call: 'calls {n}', l_raise: 'raises to {n}', l_fold: 'folds', allin: 'all-in',
      b_sb: 'Small blind {n}', b_bb: 'Big blind {n}', b_check: 'Check', b_bet: 'Bet {n}',
      b_call: 'Call {n}', b_raise: 'Raise to {n}', b_fold: 'Fold', b_allin: 'All-in {n}',
      winYou: 'You win {n}', winJev: 'Jev wins {n}',
      winYouHand: 'You win {n} with {hand}', winJevHand: 'Jev wins {n} with {hand}',
      split: 'Split pot: both have {hand}',
      byFoldYou: 'Jev folds', byFoldJev: 'You fold',
      nextHand: 'Next hand',
      bustJev: 'Jev is out of chips after {n} hands.',
      bustYou: 'You are out of chips after {n} hands.',
      q: 'Jev’s action ({street})',
      qMove: '{street} · Jev {act}',
      oppBluff: 'You are bluffing',
      jevAhead: 'Jev is ahead',
      virtual: 'Virtual chips · no real money',
      stakes: 'Blinds 1/2 · No-Limit',
      chips: '{n} virtual chips',
      net: 'Net {n}',
      mono: 'Y',
      facedown: 'Face-down card',
      card: '{rank} of {suit}',
      ...HAND_NAMES.en,
    },
    zh: {
      title: '单挑无限注德州扑克',
      tagline: '一对一的无限注德州扑克。下注从一个大盲到全下随你定：掌控下注尺度，诈唬 Jev 弃牌，或者抓住它的诈唬。',
      concept: '诈唬、下注尺度与不完全信息',
      rules: '无限注德州扑克，双方各 200 虚拟筹码（100 个大盲），盲注 1/2。下注额最少一个大盲，最多可以全下；加注的幅度至少等于上一次下注或加注的幅度，但随时都可以全下。庄家位下小盲，翻牌前先行动、翻牌后最后行动，每手轮换。一方全下并被跟注后，直接发完剩余的公共牌。七张牌中取最好的五张比大小。打到一方筹码输光为止。',
      fold: '弃牌', check: '过牌', call: '跟注', bet: '下注', raise: '加注', allinBtn: '全下',
      callN: '跟注 {n}', betN: '下注 {n}', raiseN: '加注到 {n}', allinN: '全下 {n}',
      betTo: '下注', raiseTo: '加注到', size: '下注额', minN: '最少 {n}', maxN: '全下 {n}',
      q33: '1/3 池', q50: '1/2 池', q75: '3/4 池', q100: '底池', q200: '2 倍池', qAll: '全下',
      q33t: '底池的三分之一', q50t: '底池的一半', q75t: '底池的四分之三', q100t: '与底池相同', q200t: '底池的两倍',
      runout: '全下：发完剩余公共牌',
      preflop: '翻牌前', flop: '翻牌圈', turn: '转牌圈', river: '河牌圈', showdown: '摊牌',
      pot: '底池', hand: '第 {n} 手', dealer: '庄家按钮',
      yourTurn: '轮到你了', toCall: '需跟注 {n}', jevTurn: 'Jev 思考中',
      log: '本手记录', recent: '最近几手',
      l_sb: '下小盲 {n}', l_bb: '下大盲 {n}', l_check: '过牌', l_bet: '下注 {n}',
      l_call: '跟注 {n}', l_raise: '加注到 {n}', l_fold: '弃牌', allin: '全下',
      b_sb: '小盲 {n}', b_bb: '大盲 {n}', b_check: '过牌', b_bet: '下注 {n}',
      b_call: '跟注 {n}', b_raise: '加注到 {n}', b_fold: '弃牌', b_allin: '全下 {n}',
      winYou: '你赢得 {n}', winJev: 'Jev 赢得 {n}',
      winYouHand: '你以{hand}赢得 {n}', winJevHand: 'Jev 以{hand}赢得 {n}',
      split: '平分底池：双方都是{hand}',
      byFoldYou: 'Jev 弃牌', byFoldJev: '你弃牌',
      nextHand: '下一手',
      bustJev: '打了 {n} 手，Jev 的筹码输光了。',
      bustYou: '打了 {n} 手，你的筹码输光了。',
      q: 'Jev 的行动（{street}）',
      qMove: '{street} · Jev {act}',
      oppBluff: '你在诈唬',
      jevAhead: 'Jev 领先',
      virtual: '虚拟筹码 · 不涉及金钱',
      stakes: '盲注 1/2 · 无限注',
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
    let sel = 0, selKey = ''; // the human's chosen bet/raise total, remembered per decision
    let revealAt = 0, plan = null; // all-in run-out: results stay hidden until revealAt
    // Jev modes: Jev's odds are sealed during a hand and reviewed when it ends; the review stays
    // up until Jev's first decision of the next hand.
    let reviewing = false;
    // Calibration of Jev's 'ahead' judgement is scored at decision time: does Jev's hand beat the
    // human's actual hand on the current board? (ties skipped). Every decision counts, folds included.
    const endOfHand = () => { if (panel.sealed?.length) { panel.unseal(); reviewing = true; } };
    const revealing = () => hand.done && performance.now() < revealAt;
    // anonymous telemetry: never allowed to break the game
    const track = (fn, ...a) => { try { ctx.track?.[fn]?.(...a); } catch { /* ignore */ } };
    // One action (call before applyAction): street, action ('allin' when a bet or raise puts the
    // whole remaining stack in; an all-in call stays 'call', it isn't aggressive) and the actor's
    // hand-strength bucket from equity vs a random hand.
    function trackMove(p, a, to, res) {
      try {
        const amt = a === 'fold' || a === 'check' ? 0 : amountFor(hand, a, to);
        const e = equity(hand.holes[p], hand.board, 400);
        const ev = {
          ph: STREETS[hand.street],
          act: (a === 'bet' || a === 'raise') && amt > 0 && amt >= hand.stacks[p] ? 'allin' : a,
          x: e < 0.4 ? 'weak' : e < 0.6 ? 'medium' : 'strong',
        };
        if (p === HUMAN) track('human', ev); else track('opp', res, ev);
      } catch { /* ignore */ }
    }

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
      track('start');
      gen++;
      stacks = [START_STACK, START_STACK];
      button = HUMAN;
      stats = emptyStats();
      handNo = 0;
      past = [];
      results = [];
      over = false;
      busy = false;
      reviewing = false;
      panel.clearSealed();
      panel.waiting();
      startHand();
    }

    function startHand() {
      handNo++;
      born.clear();
      hand = newHand(stacks, button);
      busy = false;
      revealAt = 0; plan = null;
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
          if (over) track('end', stacks[HUMAN] > 0 ? 'win' : 'lose');
          past.push(summarizeHand(hand, handNo));
          if (past.length > RECENT) past.shift();
          results.push({ n: handNo, winner: hand.result.winner, pot: hand.result.pot, showdown: hand.result.showdown });
          if (results.length > RECENT) results.shift();
          if (hand.runoutFrom != null && !reduced) {
            plan = runoutPlan(hand.runoutFrom);
            revealAt = performance.now() + plan.end;
            const g = gen;
            wait(plan.end + 30).then(() => { if (alive && g === gen) { endOfHand(); render(); } });
          } else {
            endOfHand();
          }
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
    function act(a, turn, to = 0) {
      if (!alive || busy || hand.done || hand.toAct !== HUMAN || turn !== hand.history.length) return;
      if (!legalActions(hand).includes(a)) return;
      if (a === 'bet' || a === 'raise') {
        const r = raiseRange(hand);
        if (!r || !Number.isInteger(to) || to < r.min || to > r.max) return;
      }
      recordStats(stats, hand, a);
      trackMove(HUMAN, a, to);
      applyAction(hand, a, to);
      step();
    }

    // Label for one of Jev's option ids (fold / check / call / size ids).
    function optLabel(o, callN) {
      if (o.act === 'call') return T('callN', { n: callN });
      if (o.act === 'bet' || o.act === 'raise') {
        if (o.id === 'allin') return T('allinN', { n: o.to });
        return T(o.act === 'bet' ? 'betN' : 'raiseN', { n: o.to });
      }
      return T(o.act);
    }

    async function jevTurn() {
      const g = gen;
      const t0 = performance.now();
      if (!reviewing) panel.thinking(); // don't wipe last hand's review before the first sealed move
      await wait(250);
      if (!alive || g !== gen) return;
      const cur = hand;
      const street = cur.street;
      const opts = jevOptions(cur);
      const ids = opts.map((o) => o.id);
      const callN = amountFor(cur, 'call');
      const build = (mode) => (mode === 'raw' ? makeRawPayload(cur, JEV, past, handNo) : makePayload(cur, JEV, stats, past, handNo));
      let res;
      try {
        res = await ctx.decide('holdem', build, localBot);
      } catch (err) {
        console.warn('[holdem] decide failed, using practice bot', err);
        res = { answers: localBot(build('hinted')), model: 'practice bot', source: 'local', mode: 'hinted', ms: 0 };
      }
      if (!alive || g !== gen) return;
      const spent = performance.now() - t0;
      // Let the deal animation finish before Jev's first move of a hand (otherwise an instant
      // pre-flop fold looks like a fresh deal flashing by); later moves need less time.
      const minThink = cur.history.length === 0 ? 1500 : 800;
      if (spent < minThink) await wait(minThink - spent);
      if (!alive || g !== gen) return;
      const id = ctx.pickAction(res.answers?.action, ids);
      const o = opts.find((x) => x.id === id) || opts[0];
      const moveN = o.act === 'call' ? callN : o.to;
      reviewing = false;
      panel.reveal(res, {
        labels: () => Object.fromEntries(opts.map((x) => [x.id, optLabel(x, callN)])),
        picked: o.id,
        title: () => T('qMove', { street: T(STREETS[street]), act: T(`l_${o.act}`, { n: moveN }) }),
        extras: () => [
          { label: T('oppBluff'), value: res.answers?.opp_bluffing?.noul },
          { label: T('jevAhead'), value: res.answers?.ahead?.noul },
        ],
      });
      recordStats(stats, cur, o.act);
      const pAhead = res.answers?.ahead?.noul;
      if (typeof pAhead === 'number') {
        try {
          const mine = evaluate([...cur.holes[JEV], ...cur.board]);
          const theirs = evaluate([...cur.holes[HUMAN], ...cur.board]);
          if (mine !== theirs) track('cal', res, { ph: 'ahead', p: pAhead, truth: mine > theirs });
        } catch { /* ignore */ }
      }
      trackMove(JEV, o.act, o.to, res);
      applyAction(cur, o.act, o.to);
      step();
    }

    // ---------- rendering ----------

    const who = (p) => (p === HUMAN ? t('you') : t('opp'));

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
          ? h('span.hd-court', h('span.hd-crown', { html: CROWN }), h('span.hd-court-l', RANK_LABEL[r]), h('span.hd-court-s', { html: suitSvg(s) }))
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

    // Chips behind as shown: while an all-in run-out is still being dealt, the pre-settlement stacks.
    function shownStack(p) {
      if (!revealing()) return hand.stacks[p];
      const r = hand.result;
      return hand.stacks[p] - r.won[p] - r.returned[p];
    }
    const RO = () => (plan && hand.done ? plan.end : 0); // extra delay for showdown effects

    function winningCards() {
      const r = hand.result;
      if (!hand.done || !r.showdown || revealing()) return null;
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
        const hn = anim(`hn${p}`, 'hd-a-pop', 420, 600 + RO());
        bubble = h('div.hd-bubble.hd-hn', animAttrs(hn, winner ? 'hd-best' : ''), T(`hn_${r.names[p]}`));
      } else if (active && p === JEV && busy) {
        bubble = h('div.hd-bubble.hd-think', { 'aria-label': T('jevTurn') }, h('i'), h('i'), h('i'));
      } else {
        const la = lastAction(p);
        if (la && (!hand.done || la.e.act === 'fold')) {
          const { e, i } = la;
          const a = anim(`b${i}`, 'hd-a-pop', 380);
          const shove = e.allin && (e.act === 'bet' || e.act === 'raise' || e.act === 'call');
          bubble = h('div.hd-bubble', animAttrs(a, shove ? 'hd-b-shove' : `hd-b-${e.act}`),
            shove ? T('b_allin', { n: e.amount }) : T(`b_${e.act}`, { n: e.amount }),
            e.allin && !shove ? h('span.hd-b-allin', T('allin')) : null,
          );
        }
      }

      const stack = shownStack(p);
      const allin = stack === 0 && (!hand.done || revealing());
      const won = winner && hand.done && !revealing();
      return h(`div.hd-seat.${top ? 'hd-seat-top' : 'hd-seat-bottom'}`, { class: `${active ? 'hd-on' : ''}${won ? ' hd-won' : ''}${allin ? ' hd-is-allin' : ''}` },
        h('div.hd-hole', holes),
        h('div.hd-plate-wrap',
          hand.button === p ? h('span.hd-puck', { title: T('dealer'), 'aria-label': T('dealer') }, 'D') : null,
          h('div.hd-plate',
            h('span.hd-ava', { class: p === JEV ? 'hd-ava-jev' : 'hd-ava-you' }, p === JEV ? t('opp').slice(0, 1) : T('mono')),
            h('span.hd-pinfo',
              h('b.hd-pname', who(p)),
              allin
                ? h('span.hd-pstack.hd-pstack-allin', h('span.hd-plate-allin', T('allinBtn')))
                : h('span.hd-pstack', { title: T('chips', { n: stack }) }, h('i.hd-coin'), stack),
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
        const delay = plan && i >= hand.runoutFrom ? plan.d[i] : (i < 3 ? i : 0) * 140 + 120;
        const a = anim(`board${i}`, 'hd-a-board', 420, delay);
        const flip = anim(`bflip${i}`, 'hd-a-flip', 560, delay + 180);
        return card(c, { a, flip, cls: win ? (win.has(c) ? 'hd-win' : 'hd-dim') : '' });
      });
      const collected = hand.done ? r.pot : potSize(hand) - hand.contrib[0] - hand.contrib[1];
      let top;
      if (hand.done) {
        const dur = 900;
        const potDelay = (r.showdown ? 900 : 250) + RO();
        const potA = anim('potwin', r.winner === JEV ? 'hd-a-to-top' : r.winner === HUMAN ? 'hd-a-to-bottom' : 'hd-a-fade', dur, potDelay);
        const banner = anim('banner', 'hd-a-banner', 500, (r.showdown ? 1100 : 350) + RO());
        top = h('div.hd-potrow',
          !settled('potwin', dur + potDelay) ? chips(collected, 'hd-pot', potA, false) : null,
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
      const r = hand.result;
      const now = !hand.done ? hand.stacks[HUMAN] + hand.total[HUMAN]
        : revealing() ? hand.stacks[HUMAN] - r.won[HUMAN] + r.pot / 2 : hand.stacks[HUMAN];
      const net = now - START_STACK;
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
      if (revealing()) {
        return h('div.hd-bar',
          h('p.hd-say.hd-wait', T('runout'), h('span.hd-dots', h('i'), h('i'), h('i'))),
          h('div.hd-btns', h('button.hd-act.hd-ghost', { type: 'button', disabled: true, 'aria-hidden': 'true', tabindex: '-1' }, T('nextHand'))),
        );
      }
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
      const r = raiseRange(hand);
      const btns = [];
      if (legal.includes('fold')) {
        btns.push(h('button.hd-act.hd-act-fold', { type: 'button', disabled: busy, onclick: () => act('fold', turn) }, h('span', T('fold'))));
      }
      if (legal.includes('check')) {
        btns.push(h('button.hd-act.hd-act-plain', { type: 'button', disabled: busy, onclick: () => act('check', turn) }, h('span', T('check'))));
      }
      if (legal.includes('call')) {
        const n = amountFor(hand, 'call');
        const all = n === hand.stacks[HUMAN];
        btns.push(h('button.hd-act.hd-act-plain', { type: 'button', disabled: busy, onclick: () => act('call', turn) },
          h('span', all ? T('allinBtn') : T('call')), h('b.hd-act-n', n)));
      }
      let sizer = null;
      if (r) {
        const key = `${handNo}:${turn}`;
        if (selKey !== key) { selKey = key; sel = clampTo(r, potFractionTo(hand, 3 / 4)); }
        const aggLabel = () => (sel >= r.max ? T('allinBtn') : T(r.kind === 'bet' ? 'betTo' : 'raiseTo'));
        // (texts are updated in place: replacing the children mid-click would swallow the click)
        const aggK = h('span', aggLabel()), aggN = h('b.hd-act-n', sel);
        const aggBtn = h('button.hd-act.hd-act-gold.hd-act-agg', { type: 'button', disabled: busy, onclick: () => act(r.kind, turn, sel) }, aggK, aggN);
        const allBtn = h('button.hd-act.hd-act-allin', { type: 'button', disabled: busy, onclick: () => act(r.kind, turn, r.max) },
          h('span', T('allinBtn')), h('b.hd-act-n', r.max));
        if (r.min < r.max) {
          const quick = [...QUICK.map(([k, f]) => ({ k, to: clampTo(r, potFractionTo(hand, f)), title: T(`${k}t`) })), { k: 'qAll', to: r.max, title: T('maxN', { n: r.max }) }];
          let slider, num;
          const chipsEls = quick.map((q) => h('button.hd-q', { type: 'button', title: `${q.title} · ${q.to}`, 'aria-label': `${T(q.k)} (${q.to})`, disabled: busy, onclick: () => setSel(q.to) }, T(q.k)));
          const sync = (from) => {
            if (slider && from !== 'slider') slider.value = String(sel);
            if (num && from !== 'num') num.value = String(sel);
            aggK.textContent = aggLabel();
            aggN.textContent = String(sel);
            aggBtn.classList.toggle('hd-act-shove', sel >= r.max);
            chipsEls.forEach((el, i) => el.classList.toggle('hd-q-on', quick[i].to === sel));
            if (slider) slider.style.setProperty('--fill', `${((sel - r.min) / (r.max - r.min)) * 100}%`);
          };
          const setSel = (v, from) => {
            if (!Number.isFinite(v)) return;
            sel = Math.min(r.max, Math.max(r.min, Math.round(v)));
            sync(from);
          };
          slider = h('input.hd-range', {
            type: 'range', min: r.min, max: r.max, step: 1, value: sel, disabled: busy, 'aria-label': T('size'),
            oninput: (ev) => setSel(Number(ev.target.value), 'slider'),
          });
          num = h('input.hd-num', {
            type: 'number', min: r.min, max: r.max, step: 1, value: sel, inputmode: 'numeric', disabled: busy, 'aria-label': T('size'),
            oninput: (ev) => { const v = Number(ev.target.value); if (Number.isInteger(v) && v >= r.min && v <= r.max) setSel(v, 'num'); },
            onchange: (ev) => setSel(Number(ev.target.value) || r.min),
            onkeydown: (ev) => { if (ev.key === 'Enter') { setSel(Number(ev.target.value) || r.min); act(r.kind, turn, sel); } },
          });
          sizer = h('div.hd-sizer',
            h('div.hd-quick', chipsEls),
            h('div.hd-slide',
              h('span.hd-lim', T('minN', { n: r.min })),
              slider,
              h('label.hd-numwrap', h('span.hd-numk', T(r.kind === 'bet' ? 'betTo' : 'raiseTo')), num),
            ),
          );
          sync();
          btns.push(aggBtn);
        }
        btns.push(allBtn);
      }
      return h('div.hd-bar',
        h('p.hd-say', T('yourTurn'), tc > 0 ? h('span.hd-tocall', T('toCall', { n: Math.min(tc, hand.stacks[HUMAN]) })) : null),
        sizer,
        h('div.hd-btns', { class: btns.length > 3 ? 'hd-btns-4' : '' }, btns),
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
      const shown = revealing() ? results.slice(0, -1) : results;
      if (!shown.length) return null;
      return h('div.hd-recent',
        h('div.hd-log-title', T('recent')),
        h('ol', shown.slice().reverse().map((x) => h('li', { class: x.winner === HUMAN ? 'hd-good' : x.winner === JEV ? 'hd-bad' : '' },
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
        panel.clearSealed();
        timers.forEach(clearTimeout);
        timers.clear();
      },
    };
  },
};
