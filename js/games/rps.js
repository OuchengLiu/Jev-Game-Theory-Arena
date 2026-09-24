// Rock-Paper-Scissors: "Predict the human". Jev judges, code acts:
// Jev only predicts your next throw; code turns the prediction into a counter-strategy
// blended with the Nash equilibrium (1/3 each), leaning on Nash when the read is weak.

import { choiceAnswer, noulAnswer, normalize } from '../engine.js';
import { THROWS, COUNTER, outcomeOf, analyze, applyRel, COND } from '../../shared/games/rps.js';

const TOTAL = 20;
const EMOJI = { rock: '✊', paper: '✋', scissors: '✌️' };
const KEYS = { 1: 'rock', 2: 'paper', 3: 'scissors', r: 'rock', p: 'paper', s: 'scissors' };

/**
 * Turn a prediction of the human's throw into Jev's own mixed strategy.
 * Exploit weight w grows with how lopsided the prediction is, the "patterned" judgement,
 * Jev's confidence and the amount of history; the rest is uniform (Nash) noise.
 */
export function jevStrategy(predict, patterned, n) {
  const pred = normalize(Object.fromEntries(THROWS.map((x) => [x, predict?.probabilities?.[x] ?? 0])));
  const edge = Math.max(...THROWS.map((x) => pred[x])) - 1 / 3; // 0 … 2/3
  const lean = Math.min(1, edge * 3);
  const pat = typeof patterned === 'number' ? patterned : lean;
  const conf = typeof predict?.confidence === 'number' ? Math.min(1, predict.confidence * 3) : 0.5;
  const warm = Math.min(1, n / 4);
  const w = (0.2 + 0.7 * (0.5 * lean + 0.5 * pat)) * (0.6 + 0.4 * conf) * (0.4 + 0.6 * warm);
  const mix = Object.fromEntries(THROWS.map((x) => [x, (1 - w) / 3]));
  for (const x of THROWS) mix[COUNTER[x]] += w * pred[x];
  return { pred, mix, w };
}

// Built-in bot: frequency + first-order Markov (after throw X) + habit after win/loss/draw.
export function localBot({ history }) {
  const a = analyze(history);
  const wts = { rock: 1, paper: 1, scissors: 1 };
  for (const x of THROWS) wts[x] += 0.5 * a.counts[x];
  if (a.last) {
    for (const x of THROWS) wts[x] += 1.0 * a.seq[a.last.human][x];
    const hc = a.habitCounts[COND[a.last.outcome]];
    for (const [rel, c] of Object.entries(hc)) wts[applyRel(a.last.human, rel)] += 1.3 * c;
  }
  const predict = choiceAnswer(wts);
  const edge = Math.max(...Object.values(predict.probabilities)) - 1 / 3;
  return {
    predict,
    patterned: noulAnswer(Math.min(0.95, 0.1 + edge * 2.2 * Math.min(1, a.n / 5))),
  };
}

export default {
  id: 'rps',
  meta: { icon: '✊', accent: '#ec4899', minutes: 2 },
  strings: {
    en: {
      title: 'Rock · Paper · Scissors',
      tagline: 'Twenty throws. Jev doesn’t choose a hand. It predicts yours, and the code plays whatever beats it.',
      concept: 'Mixed-strategy Nash equilibrium',
      rules: 'Rock beats scissors, scissors beats paper, paper beats rock. 20 rounds; most round wins takes the match. Each round Jev predicts your next throw and plays the counter, mixed with some randomness. Throwing each hand exactly 1/3 of the time at random is the Nash equilibrium: nobody can beat it on average. Any pattern you fall into can be exploited. Keys: 1 / 2 / 3.',
      rock: 'Rock', paper: 'Paper', scissors: 'Scissors',
      choose: 'Round {n}: make your throw',
      shoot: 'Rock… paper… scissors…',
      winRound: 'You win the round',
      loseRound: 'Jev wins the round',
      drawRound: 'Draw',
      predicted: 'Jev predicted you’d throw {x}',
      noRead: 'Jev had no clear read on you yet',
      q: 'Jev thinks you’ll throw…',
      patterned: 'Pattern spotted',
      exploit: 'Exploiting (vs. random)',
      plays: 'Jev plays {x}',
      history: 'History',
      final: 'Round wins {a} : {b} · {d} draws',
      readStat: 'Jev predicted your throw {k} of {n} times. Guessing at random gets about 1 in 3.',
      mixStat: 'Your mix: ✊ {r} · ✋ {p} · ✌️ {s}',
      draws: 'Draws',
    },
    zh: {
      title: '石头剪刀布',
      tagline: '二十把。Jev 不直接出拳，而是预测你会出什么，再由代码出克制你的那一手。',
      concept: '混合策略纳什均衡',
      rules: '石头赢剪刀，剪刀赢布，布赢石头。共 20 回合，赢的回合多者胜。每回合 Jev 先预测你要出什么，然后出能克制它的那一手，并掺入一定的随机性。三种手势各以 1/3 的概率随机出，就是纳什均衡：长期来看谁也赢不了你。只要你出拳有规律，就可能被利用。快捷键：1 / 2 / 3。',
      rock: '石头', paper: '布', scissors: '剪刀',
      choose: '第 {n} 回合，请出拳',
      shoot: '石头……剪刀……布……',
      winRound: '这回合你赢了',
      loseRound: '这回合 Jev 赢了',
      drawRound: '平局',
      predicted: 'Jev 猜你会出{x}',
      noRead: 'Jev 暂时还看不透你',
      q: 'Jev 猜你会出……',
      patterned: '看出规律',
      exploit: '针对性出招（相对随机）',
      plays: 'Jev 出{x}',
      history: '历史',
      final: '回合胜负 {a} : {b} · 平局 {d} 次',
      readStat: 'Jev 猜中了你 {k} / {n} 次。纯靠瞎猜大约是三分之一。',
      mixStat: '你的出拳：✊ {r} · ✋ {p} · ✌️ {s}',
      draws: '平局',
    },
  },

  mount(board, ctx) {
    const { t, h, panel } = ctx;
    let alive = true;
    let history, wins, busy, last, hits;

    function reset() {
      history = []; // { human, jev, outcome }
      wins = { human: 0, jev: 0, draw: 0 };
      hits = 0;
      busy = false;
      last = null;
      panel.waiting();
      render();
    }

    const name = (x) => t(`rps.${x}`);

    async function play(human) {
      if (busy || !alive || history.length >= TOTAL) return;
      busy = true;
      last = { human, pending: true };
      render();
      panel.thinking();
      // Simultaneous move: Jev only sees past rounds, never the current throw.
      const payload = { round: history.length + 1, total: TOTAL, history: history.map((x) => ({ ...x })) };
      const res = await ctx.decide('rps', payload, localBot);
      if (!alive) return;
      const patterned = res.answers?.patterned?.noul;
      const { pred, mix, w } = jevStrategy(res.answers?.predict, patterned, history.length);
      const top = THROWS.reduce((a, b) => (pred[b] > pred[a] ? b : a));
      const guess = pred[top] - Math.min(...THROWS.map((x) => pred[x])) >= 0.03 ? top : null; // null: no real read
      const jev = ctx.pickAction(choiceAnswer(mix), THROWS);
      const outcome = outcomeOf(human, jev);
      history.push({ human, jev, outcome });
      wins[outcome === 'human_won' ? 'human' : outcome === 'jev_won' ? 'jev' : 'draw'] += 1;
      if (guess === human) hits += 1;
      last = { human, jev, outcome, guess };
      const shown = { ...res, answers: { ...res.answers, predict: { ...(res.answers?.predict || {}), probabilities: pred } } };
      panel.show(shown, {
        question: 'predict',
        labels: () => Object.fromEntries(THROWS.map((x) => [x, `${EMOJI[x]} ${name(x)}`])),
        title: () => t('rps.q'),
        extras: () => [
          { label: t('rps.patterned'), value: patterned },
          { label: t('rps.exploit'), value: w },
          ...THROWS.map((x) => ({ label: t('rps.plays', { x: `${EMOJI[x]} ${name(x)}` }), value: mix[x] })),
        ],
      });
      busy = false;
      render();
    }

    function hand(x, side, cls) {
      return h('div.rps-hand', { class: `${side} ${cls || ''}` }, h('span.rps-emoji', x ? EMOJI[x] : '✊'));
    }

    function arena() {
      if (!last) {
        return h('div.rps-arena.idle',
          h('div.rps-side', h('small', t('you')), hand(null, 'left', 'rest')),
          h('div.rps-vs', 'vs'),
          h('div.rps-side', h('small', 'Jev'), hand(null, 'right', 'rest')),
        );
      }
      if (last.pending) {
        return h('div.rps-arena.shaking',
          h('div.rps-side', h('small', t('you')), hand(null, 'left', 'shake')),
          h('div.rps-vs', h('span.rps-shoot', t('rps.shoot'))),
          h('div.rps-side', h('small', 'Jev'), hand(null, 'right', 'shake')),
        );
      }
      const cls = last.outcome === 'human_won' ? 'win' : last.outcome === 'jev_won' ? 'lose' : 'draw';
      return h('div.rps-arena', { class: cls },
        h('div.rps-side', h('small', t('you')), hand(last.human, 'left', `pop ${last.outcome === 'human_won' ? 'winner' : ''}`), h('b', name(last.human))),
        h('div.rps-vs',
          h('span.rps-verdict', t(cls === 'win' ? 'rps.winRound' : cls === 'lose' ? 'rps.loseRound' : 'rps.drawRound')),
          h('span.rps-guess', { class: !last.guess ? 'none' : last.guess === last.human ? 'hit' : 'miss' },
            last.guess ? t('rps.predicted', { x: `${EMOJI[last.guess]} ${name(last.guess)}` }) : t('rps.noRead')),
        ),
        h('div.rps-side', h('small', 'Jev'), hand(last.jev, 'right', `pop ${last.outcome === 'jev_won' ? 'winner' : ''}`), h('b', name(last.jev))),
      );
    }

    function strip() {
      return h('div.rps-strip', { 'aria-label': t('rps.history') }, Array.from({ length: TOTAL }, (_, i) => {
        const r = history[i];
        if (!r) return h('div.rps-cell.empty', h('span', i + 1));
        const cls = r.outcome === 'human_won' ? 'win' : r.outcome === 'jev_won' ? 'lose' : 'draw';
        return h('div.rps-cell', { class: cls, title: `${i + 1}: ${name(r.human)} / ${name(r.jev)}` },
          h('span', EMOJI[r.human]), h('span', EMOJI[r.jev]));
      }));
    }

    function render() {
      if (!alive) return;
      const done = history.length >= TOTAL;
      const outcome = wins.human > wins.jev ? t('result.win') : wins.human < wins.jev ? t('result.lose') : t('result.draw');
      const c = { rock: 0, paper: 0, scissors: 0 };
      history.forEach((r) => { c[r.human] += 1; });
      board.replaceChildren(
        h('div.scoreboard',
          h('div.sb-side', h('small', t('you')), h('b', wins.human)),
          h('div.sb-mid', h('small', t('round')), h('b', `${Math.min(history.length + (done ? 0 : 1), TOTAL)} / ${TOTAL}`)),
          h('div.sb-side.right', h('small', 'Jev'), h('b', wins.jev)),
        ),
        arena(),
        done
          ? h('div.result',
            h('h2', outcome),
            h('p.muted', t('rps.final', { a: wins.human, b: wins.jev, d: wins.draw })),
            h('p.muted', t('rps.readStat', { k: hits, n: TOTAL })),
            h('p.muted', t('rps.mixStat', { r: c.rock, p: c.paper, s: c.scissors })),
            h('button.btn.lg', { onclick: reset }, t('new.game')))
          : h('div.actions',
            h('p.prompt', t('rps.choose', { n: history.length + 1 })),
            h('div.rps-throws', THROWS.map((x, i) => h('button.rps-throw', {
              type: 'button', disabled: busy, onclick: () => play(x), 'aria-label': name(x),
            }, h('span.rps-throw-emoji', EMOJI[x]), h('span.rps-throw-label', name(x)), h('kbd', i + 1)))),
          ),
        h('div.rps-hist', h('div.rps-hist-head', h('small.muted', t('rps.history')), h('small.muted', `${t('rps.draws')}: ${wins.draw}`)), strip()),
      );
    }

    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || document.querySelector('dialog[open]')) return;
      const x = KEYS[e.key?.toLowerCase()];
      if (x) play(x);
    }
    document.addEventListener('keydown', onKey);

    reset();
    return {
      render,
      destroy() {
        alive = false;
        document.removeEventListener('keydown', onKey);
      },
    };
  },
};
