// Heads-up Limit Texas Hold'em vs Jev. Blinds 1/2, fixed bets 2/2/4/4, cap of 4 bets per street,
// 200-chip stacks, play continues hand after hand until one side is broke.
// Pure rules/evaluator/equity live in ./holdem-core.js (Node-testable); this file is UI + flow.
// Module contract: see js/games/pd.js.

import { choiceAnswer, noulAnswer } from '../engine.js';
import {
  START_STACK, STREETS, newHand, legalActions, amountFor, applyAction, toCall, potSize,
  recordStats, emptyStats, makePayload, botPolicy, rankOf, suitOf,
} from './holdem-core.js';

const HUMAN = 0, JEV = 1;

// Built-in bot: equity / pot-odds mixed strategy with some bluffing and slow-play.
function localBot(payload) {
  const b = botPolicy(payload);
  return {
    action: choiceAnswer(b.action),
    opp_bluffing: noulAnswer(b.opp_bluffing),
    ahead: noulAnswer(b.ahead),
  };
}

const RANK_LABEL = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUIT_SYM = ['♠', '♥', '♦', '♣'];

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
  meta: { icon: '♠️', accent: '#6366f1', minutes: 10 },
  strings: {
    en: {
      title: 'Heads-up Hold’em',
      tagline: 'Limit Texas Hold’em, one on one. Jev can’t see your cards, and you can’t see its. Bluff it, or catch it bluffing.',
      concept: 'Bluffing & imperfect information',
      rules: 'Limit hold’em, 200 chips each, blinds 1/2. Bets are fixed: 2 before the flop and on the flop, 4 on the turn and river, at most 4 bets per street. The dealer button posts the small blind and switches every hand. Best five of seven cards wins. Play until someone is out of chips.',
      fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise',
      callN: 'Call {n}', betN: 'Bet {n}', raiseN: 'Raise to {n}',
      preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown',
      pot: 'Pot', hand: 'Hand {n}', dealer: 'Dealer button',
      yourTurn: 'Your move', toCall: '{n} to call', jevTurn: 'Jev is thinking…',
      log: 'This hand',
      l_sb: 'small blind {n}', l_bb: 'big blind {n}', l_check: 'checks', l_bet: 'bets {n}',
      l_call: 'calls {n}', l_raise: 'raises to {n}', l_fold: 'folds', allin: 'all-in',
      winYou: 'You win {n}', winJev: 'Jev wins {n}',
      winYouHand: 'You win {n} with {hand}', winJevHand: 'Jev wins {n} with {hand}',
      split: 'Split pot: both have {hand}',
      shows: '{hand}',
      nextHand: 'Next hand',
      bustJev: 'Jev is out of chips after {n} hands.',
      bustYou: 'You are out of chips after {n} hands.',
      q: 'Jev’s action ({street})',
      oppBluff: 'You are bluffing',
      jevAhead: 'Jev is ahead',
      ...HAND_NAMES.en,
    },
    zh: {
      title: '单挑德州扑克',
      tagline: '一对一的限注德州扑克。Jev 看不到你的牌，你也看不到它的。去诈唬它，或者抓住它的诈唬。',
      concept: '诈唬与不完全信息',
      rules: '限注德州扑克，双方各 200 筹码，盲注 1/2。下注额固定：翻牌前和翻牌圈每注 2，转牌圈和河牌圈每注 4，每轮最多 4 注。庄家位下小盲，每手轮换。七张牌中取最好的五张比大小。打到一方筹码输光为止。',
      fold: '弃牌', check: '过牌', call: '跟注', bet: '下注', raise: '加注',
      callN: '跟注 {n}', betN: '下注 {n}', raiseN: '加注到 {n}',
      preflop: '翻牌前', flop: '翻牌圈', turn: '转牌圈', river: '河牌圈', showdown: '摊牌',
      pot: '底池', hand: '第 {n} 手', dealer: '庄家按钮',
      yourTurn: '轮到你了', toCall: '需跟注 {n}', jevTurn: 'Jev 思考中…',
      log: '本手记录',
      l_sb: '下小盲 {n}', l_bb: '下大盲 {n}', l_check: '过牌', l_bet: '下注 {n}',
      l_call: '跟注 {n}', l_raise: '加注到 {n}', l_fold: '弃牌', allin: '全下',
      winYou: '你赢得 {n}', winJev: 'Jev 赢得 {n}',
      winYouHand: '你以{hand}赢得 {n}', winJevHand: 'Jev 以{hand}赢得 {n}',
      split: '平分底池：双方都是{hand}',
      shows: '{hand}',
      nextHand: '下一手',
      bustJev: '打了 {n} 手，Jev 的筹码输光了。',
      bustYou: '打了 {n} 手，你的筹码输光了。',
      q: 'Jev 的行动（{street}）',
      oppBluff: '你在诈唬',
      jevAhead: 'Jev 领先',
      ...HAND_NAMES.zh,
    },
  },

  mount(board, ctx) {
    const { t, h, panel } = ctx;
    const T = (k, v) => t(`holdem.${k}`, v);
    let alive = true;
    let gen = 0; // bumps on new game so stale async work is ignored
    const timers = new Set();
    let stacks, button, hand, stats, handNo, busy, over;

    const wait = (ms) => new Promise((resolve) => {
      const id = setTimeout(() => { timers.delete(id); resolve(); }, ms);
      timers.add(id);
    });

    function reset() {
      gen++;
      stacks = [START_STACK, START_STACK];
      button = HUMAN;
      stats = emptyStats();
      handNo = 0;
      over = false;
      busy = false;
      panel.waiting();
      startHand();
    }

    function startHand() {
      handNo++;
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
        stacks = [...hand.stacks];
        over = stacks[HUMAN] === 0 || stacks[JEV] === 0;
        render();
        return;
      }
      render();
      if (hand.toAct === JEV) jevTurn();
    }

    function act(a) {
      if (!alive || busy || hand.done || hand.toAct !== HUMAN) return;
      if (!legalActions(hand).includes(a)) return;
      recordStats(stats, hand, a);
      applyAction(hand, a);
      step();
    }

    async function jevTurn() {
      const g = gen;
      busy = true;
      render();
      panel.thinking();
      await wait(200);
      if (!alive || g !== gen) return;
      const payload = makePayload(hand, JEV, stats);
      const street = hand.street;
      let res;
      try {
        res = await ctx.decide('holdem', payload, localBot);
      } catch (err) {
        console.warn('[holdem] decide failed, using built-in bot', err);
        res = { answers: localBot(payload), model: 'built-in', source: 'local', ms: 0 };
      }
      if (!alive || g !== gen) return;
      const legal = legalActions(hand);
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
      recordStats(stats, hand, a);
      applyAction(hand, a);
      busy = false;
      step();
    }

    // ---------- rendering ----------

    function card(c, hidden = false) {
      if (hidden) return h('span.hd-card.hd-back', { 'aria-label': '?' });
      const s = suitOf(c);
      return h('span.hd-card', { class: s === 1 || s === 2 ? 'hd-red' : '' },
        h('span.hd-rank', RANK_LABEL[rankOf(c)]), h('span.hd-suit', SUIT_SYM[s]));
    }

    const who = (p) => (p === HUMAN ? t('you') : 'Jev');

    function seat(p) {
      const showdown = hand.done && hand.result?.showdown;
      const hidden = p === JEV && !showdown;
      const bet = !hand.done && hand.contrib[p] > 0 ? hand.contrib[p] : 0;
      const res = hand.result;
      const winner = hand.done && (res.winner === p || res.winner === -1);
      return h('div.hd-seat', { class: `${p === JEV ? 'hd-top' : 'hd-bottom'}${!hand.done && hand.toAct === p ? ' hd-active' : ''}${winner ? ' hd-winner' : ''}` },
        h('div.hd-name',
          h('b', who(p)),
          hand.button === p ? h('span.hd-dealer', { title: T('dealer') }, 'D') : null,
          h('span.hd-stack', hand.stacks[p]),
        ),
        h('div.hd-cards', hand.holes[p].map((c) => card(c, hidden))),
        showdown ? h('div.hd-handname', T(`hn_${res.names[p]}`)) : null,
        h('div.hd-bet', bet ? h('span.hd-chip', bet) : null),
      );
    }

    function logLine(e) {
      const key = `l_${e.act}`;
      return h('li', { class: e.who === JEV ? 'hd-jev' : '' },
        h('span.hd-lstreet', T(STREETS[e.street])),
        h('b', who(e.who)), ' ',
        T(key, { n: e.amount }),
        e.allin ? h('span.hd-allin', T('allin')) : null,
      );
    }

    function resultLine() {
      const r = hand.result;
      if (r.winner === -1) return T('split', { hand: T(`hn_${r.names[0]}`) });
      const net = r.pot; // whole pot shown, like at a real table
      if (r.showdown) return T(r.winner === HUMAN ? 'winYouHand' : 'winJevHand', { n: net, hand: T(`hn_${r.names[r.winner]}`) });
      return T(r.winner === HUMAN ? 'winYou' : 'winJev', { n: net });
    }

    function controls() {
      if (over) {
        const won = stacks[HUMAN] > 0;
        return h('div.result',
          h('h2', t(won ? 'result.win' : 'result.lose')),
          h('p.muted', T(won ? 'bustJev' : 'bustYou', { n: handNo })),
          h('button.btn.lg', { onclick: reset }, t('new.game')),
        );
      }
      if (hand.done) {
        return h('div.actions',
          h('p.prompt.hd-result', { class: hand.result.winner === HUMAN ? 'hd-good' : hand.result.winner === JEV ? 'hd-bad' : '' }, resultLine()),
          h('div.btn-row', h('button.btn.lg', { onclick: nextHand }, T('nextHand'))),
        );
      }
      if (hand.toAct === JEV) {
        return h('div.actions', h('p.prompt.hd-wait', T('jevTurn')));
      }
      const legal = legalActions(hand);
      const tc = toCall(hand);
      const label = (a) => {
        if (a === 'call') return T('callN', { n: amountFor(hand, a) });
        if (a === 'bet') return T('betN', { n: amountFor(hand, a) });
        if (a === 'raise') return T('raiseN', { n: hand.contrib[HUMAN] + amountFor(hand, a) });
        return T(a);
      };
      const cls = { fold: 'bad', check: '', call: '', bet: 'good', raise: 'good' };
      return h('div.actions',
        h('p.prompt', T('yourTurn'), tc > 0 ? h('span.muted.hd-tocall', ` · ${T('toCall', { n: Math.min(tc, hand.stacks[HUMAN]) })}`) : null),
        h('div.btn-row.hd-btns', legal.map((a) => h(`button.btn.lg.action${cls[a] ? `.${cls[a]}` : ''}`, { disabled: busy, onclick: () => act(a) }, label(a)))),
      );
    }

    function render() {
      if (!alive) return;
      const streetLabel = hand.done && hand.result.showdown ? T('showdown') : T(STREETS[hand.street]);
      const slots = Array.from({ length: 5 }, (_, i) => (hand.board[i] != null ? card(hand.board[i]) : h('span.hd-card.hd-slot')));
      board.replaceChildren(
        h('div.scoreboard',
          h('div.sb-side', h('small', t('you')), h('b', hand.stacks[HUMAN])),
          h('div.sb-mid', h('small', T('hand', { n: handNo })), h('b', streetLabel)),
          h('div.sb-side.right', h('small', 'Jev'), h('b', hand.stacks[JEV])),
        ),
        h('div.hd-table',
          seat(JEV),
          h('div.hd-center',
            h('div.hd-board', slots),
            h('div.hd-pot', T('pot'), ' ', h('b', hand.done ? hand.result.pot : potSize(hand))),
          ),
          seat(HUMAN),
        ),
        controls(),
        h('div.hd-log',
          h('div.hd-log-title', T('log')),
          h('ol', hand.log.map(logLine)),
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
