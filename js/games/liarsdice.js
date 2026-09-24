// Liar's Dice (heads-up). Follows the module contract described in js/games/pd.js.
// Pure rules / probabilities live in ./liarsdice-core.js (Node-testable); this file is UI.

import { choiceAnswer, noulAnswer } from '../engine.js';
import {
  FACES, START_DICE, rollDice, countFace, isLegalBid, minQty, bidProb, bucket,
  makePayload, recordBids, resolveChallenge, botWeights,
} from './liarsdice-core.js';

// Built-in bot: likelihood-based mixed strategy with occasional bluffs (see botWeights).
function localBot(payload) {
  const { action, oppBluff } = botWeights(payload);
  const out = { action: choiceAnswer(action) };
  if (oppBluff != null) out.opp_bluffing = noulAnswer(oppBluff);
  return out;
}

// Pip positions on a 3x3 grid (0..8, row-major).
const PIPS = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

export default {
  id: 'liarsdice',
  meta: { icon: '🎲', accent: '#f59e0b', minutes: 6 },
  strings: {
    en: {
      title: 'Liar’s Dice',
      tagline: 'Five dice under a cup, one question: is Jev telling the truth about the dice it can’t see?',
      concept: 'Bluffing & Bayesian beliefs',
      rules: 'You and Jev each roll 5 hidden dice. Take turns bidding “at least N dice showing face F” across both cups. 1s are wild and count as every face, so you can’t bid on 1s. Each bid must be higher: more dice, or the same number with a higher face. Or call “Liar!”: if the bid is true the caller loses a die, otherwise the bidder does. The loser starts the next round. Lose all your dice and you lose.',
      jev: 'Jev', yourDice: 'Your dice', jevDice: 'Jev’s dice',
      dice: '{n} dice', die1: '1 die',
      noBid: 'No bid yet',
      youOpen: 'You open the round. Make a bid.',
      jevOpens: 'Jev opens the round…',
      yourTurn: 'Your turn: raise or call Liar',
      jevTurn: 'Jev is thinking…',
      bidBy: '{who} bid',
      bidLabel: '{q} × {f}s',
      bid: 'Bid {q} × {f}s',
      liar: 'Liar!',
      qty: 'How many',
      face: 'Face',
      wild: '1s are wild',
      hint: 'From your dice alone: {lk} ({p})',
      lk_certain: 'certain', lk_very_likely: 'very likely', lk_likely: 'likely', lk_coin_flip: 'coin flip',
      lk_unlikely: 'unlikely', lk_very_unlikely: 'very unlikely', lk_impossible: 'impossible',
      history: 'Bids this round',
      youCalled: 'You called Liar on Jev’s {b}.',
      jevCalled: 'Jev called Liar on your {b}.',
      counted: 'There are {n} × {f}s on the table (1s included).',
      bidTrue: 'The bid was true.',
      bidFalse: 'The bid was false.',
      youLose: 'You lose a die.',
      jevLoses: 'Jev loses a die.',
      revealing: 'Lifting the cups…',
      nextRound: 'Next round',
      matchWin: 'You took Jev’s last die.',
      matchLose: 'Jev took your last die.',
      q: 'Raise or call Liar?',
      qOpen: 'Opening bid',
      thinksBluff: 'Thinks you’re bluffing',
      you: 'You',
    },
    zh: {
      title: '吹牛骰子',
      tagline: '五颗骰子扣在盅里，只问一件事：Jev 叫的点数，是真是假？',
      concept: '诈唬与贝叶斯推断',
      rules: '你和 Jev 各摇 5 颗骰子，只能看自己的。双方轮流叫点：“两边加起来至少有 N 个 F 点”。1 点是万能点，可以当任何点数，所以不能叫 1。每次叫的必须更大：个数更多，或个数相同但点数更大。也可以喊“开！”：叫点成立则开的人输一颗骰子，否则叫的人输一颗。输的人先叫下一轮。骰子输光就输了。',
      jev: 'Jev', yourDice: '你的骰子', jevDice: 'Jev 的骰子',
      dice: '{n} 颗', die1: '1 颗',
      noBid: '还没人叫',
      youOpen: '这一轮你先叫。',
      jevOpens: '这一轮 Jev 先叫…',
      yourTurn: '轮到你：继续叫，还是开？',
      jevTurn: 'Jev 思考中…',
      bidBy: '{who} 叫',
      bidLabel: '{q} 个 {f}',
      bid: '叫 {q} 个 {f}',
      liar: '开！',
      qty: '个数',
      face: '点数',
      wild: '1 点万能',
      hint: '只看你自己的骰子：{lk}（{p}）',
      lk_certain: '必定成立', lk_very_likely: '很可能成立', lk_likely: '大概率成立', lk_coin_flip: '五五开',
      lk_unlikely: '不太可能', lk_very_unlikely: '很不可能', lk_impossible: '不可能',
      history: '本轮叫点',
      youCalled: '你开了 Jev 的“{b}”。',
      jevCalled: 'Jev 开了你的“{b}”。',
      counted: '桌上一共有 {n} 个 {f}（含 1 点）。',
      bidTrue: '叫点成立。',
      bidFalse: '叫点不成立。',
      youLose: '你输一颗骰子。',
      jevLoses: 'Jev 输一颗骰子。',
      revealing: '开盅…',
      nextRound: '下一轮',
      matchWin: '你赢走了 Jev 的最后一颗骰子。',
      matchLose: 'Jev 赢走了你的最后一颗骰子。',
      q: '继续叫还是开？',
      qOpen: '第一口叫点',
      thinksBluff: '认为你在吹牛',
      you: '你',
    },
  },

  mount(board, ctx) {
    const { t, h, panel } = ctx;
    const L = (k, v) => t(`liarsdice.${k}`, v);
    let alive = true;
    let gen = 0; // bumps on every new game so stale async continuations bail out
    const timers = new Set();
    const sleep = (ms) => new Promise((r) => {
      const id = setTimeout(() => { timers.delete(id); r(); }, ms);
      timers.add(id);
    });

    let dice, bids, phase, turn, busy, pick, reveal, stats, starter, roundNo;

    const total = () => dice.you.length + dice.jev.length;
    const current = () => (bids.length ? bids[bids.length - 1] : null);
    // The die a player just lost is still drawn (fading) until the next round starts.
    const lost = (who) => (phase !== 'bidding' && reveal?.shown && reveal.loser === who ? 1 : 0);
    const bidLabel = (b) => L('bidLabel', { q: b.qty, f: b.face });

    function defaultPick() {
      const cur = current();
      if (!cur) {
        // Most plausible opening: best face from your own dice, around its expected count.
        let best = { qty: 1, face: 2 };
        for (const face of FACES) {
          const qty = Math.max(1, Math.min(total(), countFace(dice.you, face) + Math.floor(dice.jev.length / 3)));
          if (qty > best.qty || (qty === best.qty && face > best.face)) best = { qty, face };
        }
        return best;
      }
      const same = { qty: cur.qty + 1, face: cur.face };
      if (isLegalBid(same, cur, total())) return same;
      for (const face of FACES) {
        const b = { qty: minQty(face, cur), face };
        if (isLegalBid(b, cur, total())) return b;
      }
      return null; // no raise possible: only Liar
    }

    function newGame() {
      gen++;
      timers.forEach(clearTimeout);
      timers.clear();
      dice = { you: rollDice(START_DICE), jev: rollDice(START_DICE) };
      stats = { honest: 0, bluff: 0 }; // how truthful the human's bids have been (Jev's view)
      roundNo = 0;
      panel.waiting();
      startRound(Math.random() < 0.5 ? 'you' : 'jev');
    }

    function startRound(who) {
      roundNo++;
      dice = { you: rollDice(dice.you.length), jev: rollDice(dice.jev.length) };
      bids = [];
      phase = 'bidding';
      turn = who;
      starter = who;
      busy = false;
      reveal = null;
      pick = defaultPick();
      render();
      if (who === 'jev') jevTurn();
    }

    async function jevTurn() {
      const g = gen;
      busy = true;
      turn = 'jev';
      render();
      panel.thinking();
      await sleep(bids.length ? 350 : 700);
      if (!alive || g !== gen) return;
      const view = bids.map((b) => ({ by: b.by === 'jev' ? 'jev' : 'opp', qty: b.qty, face: b.face }));
      const cur = current();
      const { payload, optionMap } = makePayload(dice.jev, dice.you.length, view, stats);
      const res = await ctx.decide('liarsdice', payload, localBot);
      if (!alive || g !== gen) return;
      const legal = Object.keys(optionMap);
      const id = ctx.pickAction(res.answers?.action, legal);
      const opt = optionMap[id];
      panel.show(res, {
        labels: () => Object.fromEntries(legal.map((k) => [k, optionMap[k].type === 'challenge' ? L('liar') : bidLabel(optionMap[k])])),
        picked: id,
        title: () => L(cur ? 'q' : 'qOpen'),
        extras: () => (cur ? [{ label: L('thinksBluff'), value: res.answers?.opp_bluffing?.noul }] : []),
      });
      if (opt.type === 'challenge') {
        await callLiar('jev');
        return;
      }
      bids.push({ by: 'jev', qty: opt.qty, face: opt.face });
      turn = 'you';
      busy = false;
      pick = defaultPick();
      render();
    }

    function humanBid() {
      if (busy || phase !== 'bidding' || turn !== 'you' || !pick) return;
      if (!isLegalBid(pick, current(), total())) return;
      bids.push({ by: 'you', qty: pick.qty, face: pick.face });
      jevTurn();
    }

    function humanLiar() {
      if (busy || phase !== 'bidding' || turn !== 'you' || !current()) return;
      callLiar('you');
    }

    async function callLiar(challenger) {
      const g = gen;
      busy = true;
      const bid = current();
      const all = [...dice.you, ...dice.jev];
      const { count, bidTrue } = resolveChallenge(all, bid);
      const loser = bidTrue ? challenger : bid.by;
      stats = recordBids(stats, bids, 'you', all);
      reveal = { bid, challenger, count, bidTrue, loser, shown: false, lostIdx: -1 };
      phase = 'reveal';
      render();
      await sleep(1500);
      if (!alive || g !== gen) return;
      reveal.shown = true;
      // Mark one of the loser's dice as the one that goes (prefer a non-matching die).
      const ld = dice[loser];
      let idx = ld.findIndex((d) => d !== bid.face && d !== 1);
      if (idx < 0) idx = ld.length - 1;
      reveal.lostIdx = idx;
      phase = dice[loser].length - 1 <= 0 ? 'matchover' : 'roundover';
      starter = loser;
      busy = false;
      render();
    }

    function nextRound() {
      if (phase !== 'roundover') return;
      const loser = reveal.loser;
      dice[loser] = dice[loser].slice(0, -1); // re-rolled anyway; only the count matters
      startRound(starter);
    }

    // ---------------- rendering ----------------

    function die(face, cls = '', style) {
      const on = new Set(PIPS[face] || []);
      return h('span.ld-die', { class: `${cls} ${face === 1 ? 'ld-one' : ''}`.trim(), style, 'aria-label': String(face) },
        Array.from({ length: 9 }, (_, i) => h('i', { class: on.has(i) ? 'p' : '' })));
    }
    const back = (i) => h('span.ld-die.ld-back', { style: { animationDelay: `${i * 40}ms` } });

    function diceRow(who) {
      const arr = dice[who];
      const showing = who === 'you' || phase !== 'bidding';
      const lostCount = lost(who) > 0;
      const n = arr.length - lost(who);
      return h('div.ld-cup', { class: who === 'jev' ? 'ld-cup-jev' : 'ld-cup-you' },
        h('div.ld-cup-head',
          h('span.ld-who', who === 'jev' ? L('jevDice') : L('yourDice')),
          h('span.ld-count', n === 1 ? L('die1') : L('dice', { n }),
            lostCount ? h('b.ld-minus', ' −1') : null),
        ),
        h('div.ld-dice', arr.map((d, i) => {
          if (!showing) return back(i);
          let cls = '';
          if (reveal) {
            cls = d === 1 ? 'ld-wild' : d === reveal.bid.face ? 'ld-match' : 'ld-dim';
            if (who === 'jev') cls += ' ld-flip';
            if (lostCount && i === reveal.lostIdx) cls += ' ld-lost';
          }
          return die(d, cls, who === 'jev' && reveal ? { animationDelay: `${i * 90}ms` } : undefined);
        })),
      );
    }

    function currentBidView() {
      const cur = current();
      if (!cur) {
        return h('div.ld-bid.ld-bid-empty', h('span.muted', phase === 'bidding' && turn === 'jev' ? L('jevOpens') : L('noBid')));
      }
      return h('div.ld-bid', { class: cur.by === 'jev' ? 'ld-bid-jev' : 'ld-bid-you' },
        h('small', L('bidBy', { who: cur.by === 'jev' ? 'Jev' : L('you') })),
        h('div.ld-bid-main', h('b.ld-qty', cur.qty), h('span.ld-x', '×'), die(cur.face, 'ld-big')),
      );
    }

    function historyView() {
      if (bids.length < 2) return null;
      return h('div.ld-history',
        h('small.muted', L('history')),
        h('div.ld-chips', bids.slice(0, -1).map((b) => h('span.ld-chip', { class: b.by === 'jev' ? 'ld-chip-jev' : '' },
          h('span.ld-chip-who', b.by === 'jev' ? 'Jev' : L('you')), ` ${b.qty} × `, die(b.face, 'ld-tiny')))),
      );
    }

    function picker() {
      const cur = current();
      const tot = total();
      const myTurn = phase === 'bidding' && turn === 'you' && !busy;
      const canBid = myTurn && pick && isLegalBid(pick, cur, tot);
      const setPick = (p) => { if (!busy) { pick = p; render(); } };
      const q = pick?.qty ?? 0;
      const f = pick?.face ?? 2;
      const hint = pick && myTurn
        ? L('hint', { lk: L(`lk_${bucket(dice.you, dice.jev.length, pick)}`), p: `${Math.round(bidProb(dice.you, dice.jev.length, pick) * 100)}%` })
        : ' ';
      return h('div.actions.ld-actions',
        h('p.prompt', myTurn ? (cur ? L('yourTurn') : L('youOpen')) : L('jevTurn')),
        h('div.ld-picker', { class: myTurn ? '' : 'ld-disabled' },
          h('div.ld-field',
            h('small.muted', L('qty')),
            h('div.ld-stepper',
              h('button.btn.ghost.ld-step', { type: 'button', disabled: !myTurn || !pick || !isLegalBid({ qty: q - 1, face: f }, cur, tot), onclick: () => setPick({ qty: q - 1, face: f }), 'aria-label': '−' }, '−'),
              h('b.ld-stepval', pick ? q : '–'),
              h('button.btn.ghost.ld-step', { type: 'button', disabled: !myTurn || !pick || q + 1 > tot, onclick: () => setPick({ qty: q + 1, face: f }), 'aria-label': '+' }, '+'),
            ),
          ),
          h('div.ld-field',
            h('small.muted', L('face'), ' · ', L('wild')),
            h('div.ld-faces', FACES.map((face) => {
              const m = minQty(face, cur);
              const possible = m <= tot;
              return h('button.ld-face', {
                type: 'button',
                class: pick && face === f ? 'on' : '',
                disabled: !myTurn || !possible,
                onclick: () => setPick({ qty: Math.max(q || 1, m), face }),
                'aria-label': String(face),
              }, die(face, 'ld-small'));
            })),
          ),
        ),
        h('p.ld-hint.muted', hint),
        h('div.btn-row',
          h('button.btn.lg.ld-bidbtn', { disabled: !canBid, onclick: humanBid }, pick ? L('bid', { q, f }) : L('bid', { q: '–', f: '–' })),
          h('button.btn.lg.action.bad.ld-liar', { disabled: !myTurn || !cur, onclick: humanLiar }, L('liar')),
        ),
      );
    }

    function revealView() {
      const r = reveal;
      const lines = [
        h('p.ld-call', r.challenger === 'you' ? L('youCalled', { b: bidLabel(r.bid) }) : L('jevCalled', { b: bidLabel(r.bid) })),
      ];
      if (!r.shown) {
        lines.push(h('p.muted.ld-pulse', L('revealing')));
        return h('div.ld-verdict', lines);
      }
      lines.push(h('p.ld-counted', L('counted', { n: r.count, f: r.bid.face })));
      lines.push(h('p.ld-outcome', { class: r.loser === 'you' ? 'ld-bad' : 'ld-good' },
        r.bidTrue ? L('bidTrue') : L('bidFalse'), ' ', r.loser === 'you' ? L('youLose') : L('jevLoses')));
      if (phase === 'roundover') lines.push(h('div.btn-row', h('button.btn.lg', { onclick: nextRound }, L('nextRound'))));
      return h('div.ld-verdict', lines);
    }

    function render() {
      const youN = dice.you.length - lost('you');
      const jevN = dice.jev.length - lost('jev');
      const won = phase === 'matchover' && reveal.loser === 'jev';
      board.replaceChildren(
        h('div.scoreboard',
          h('div.sb-side', h('small', t('you')), h('b', youN)),
          h('div.sb-mid', h('small', t('round')), h('b', roundNo)),
          h('div.sb-side.right', h('small', 'Jev'), h('b', jevN)),
        ),
        h('div.ld-table',
          diceRow('jev'),
          h('div.ld-center', currentBidView(), historyView()),
          diceRow('you'),
        ),
        phase === 'bidding' ? picker() : revealView(),
        phase === 'matchover'
          ? h('div.result',
            h('h2', won ? t('result.win') : t('result.lose')),
            h('p.muted', won ? L('matchWin') : L('matchLose')),
            h('button.btn.lg', { onclick: newGame }, t('new.game')))
          : null,
      );
    }

    newGame();
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
