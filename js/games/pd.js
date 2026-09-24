// Iterated Prisoner's Dilemma. Reference implementation of the game-module contract:
//
//   export default {
//     id, meta: { icon, accent, minutes }, strings: { en, zh },   // strings → t(`${id}.key`)
//     mount(board, ctx) -> { render(), destroy() }
//   }
// Required strings: title, tagline, concept, rules.
// ctx: { t, h, panel, decide, pickAction, choiceAnswer, noulAnswer, normalize, toast, settings }

import { choiceAnswer, noulAnswer } from '../engine.js';

const TOTAL = 10;
const PAYOFF = { CC: [3, 3], CD: [0, 5], DC: [5, 0], DD: [1, 1] }; // [human, jev] keyed by human+jev

// Built-in bot: generous tit-for-tat with an end-game defection streak.
function localBot({ round, total, history }) {
  const last = history[history.length - 1];
  const oppC = history.filter((x) => x.opp === 'C').length;
  const rate = history.length ? oppC / history.length : 0.6;
  let pc = !last ? 0.85 : last.opp === 'C' ? 0.9 : 0.2;
  pc = 0.7 * pc + 0.3 * rate;
  if (round === total) pc *= 0.25;
  return {
    action: choiceAnswer({ cooperate: pc, defect: 1 - pc }),
    opp_will_cooperate: noulAnswer(!last ? 0.6 : last.opp === 'C' ? 0.5 + rate / 2 : rate / 2),
  };
}

export default {
  id: 'pd',
  meta: { icon: '🤝', accent: '#10b981', minutes: 3 },
  strings: {
    en: {
      title: "Prisoner's Dilemma",
      tagline: 'Ten rounds of cooperate or defect. Will you trust a model that has no reason to trust you?',
      concept: 'Repeated games',
      rules: 'Each round you both choose at once. Both cooperate: 3 points each. Both defect: 1 each. One defects while the other cooperates: 5 to the defector, 0 to the cooperator. 10 rounds.',
      cooperate: 'Cooperate', defect: 'Defect',
      choose: 'Your move for round {n}',
      oppWill: 'Opponent will cooperate',
      you_c: 'You cooperated', you_d: 'You defected',
      jev_c: 'Jev cooperated', jev_d: 'Jev defected',
      final: 'Final score {a} : {b}',
      matrix: 'Payoff matrix (you, Jev)',
      history: 'History',
      q: 'Cooperate or defect?',
    },
    zh: {
      title: '囚徒困境',
      tagline: '十个回合，每回合选合作或背叛。一个没有理由信任你的模型，你敢信任它吗？',
      concept: '重复博弈',
      rules: '每回合双方同时出招。都合作各得 3 分，都背叛各得 1 分；一方背叛、另一方合作时，背叛者得 5 分，合作者得 0 分。共 10 回合。',
      cooperate: '合作', defect: '背叛',
      choose: '第 {n} 回合，你的选择',
      oppWill: '对手会合作',
      you_c: '你选择合作', you_d: '你选择背叛',
      jev_c: 'Jev 合作', jev_d: 'Jev 背叛',
      final: '最终比分 {a} : {b}',
      matrix: '收益矩阵（你, Jev）',
      history: '历史',
      q: '合作还是背叛？',
    },
  },

  mount(board, ctx) {
    const { t, h, panel } = ctx;
    let history, score, busy, last;

    function reset() {
      history = []; // { jev, opp } from Jev's perspective (opp = human)
      score = [0, 0];
      busy = false;
      last = null;
      panel.waiting();
      render();
    }

    async function play(mine) {
      if (busy || history.length >= TOTAL) return;
      busy = true;
      render();
      panel.thinking();
      // Jev decides without seeing the human's current move (simultaneous game).
      const payload = { round: history.length + 1, total: TOTAL, history: history.map((x) => ({ ...x })) };
      const res = await ctx.decide('pd', payload, localBot);
      const jevAct = ctx.pickAction(res.answers.action, ['cooperate', 'defect']);
      const jev = jevAct === 'cooperate' ? 'C' : 'D';
      const [a, b] = PAYOFF[mine + jev];
      score = [score[0] + a, score[1] + b];
      history.push({ jev, opp: mine });
      last = { mine, jev, a, b };
      panel.show(res, {
        labels: () => ({ cooperate: t('pd.cooperate'), defect: t('pd.defect') }),
        picked: jevAct,
        title: () => t('pd.q'),
        extras: () => [{ label: t('pd.oppWill'), value: res.answers.opp_will_cooperate?.noul }],
      });
      busy = false;
      render();
    }

    function matrix() {
      const cell = (k, hl) => h('td', { class: hl ? 'hl' : '' }, `${PAYOFF[k][0]}, ${PAYOFF[k][1]}`);
      const hl = last && history.length ? last.mine + last.jev : '';
      return h('table.matrix',
        h('caption', t('pd.matrix')),
        h('tr', h('th'), h('th', 'Jev: ', t('pd.cooperate')), h('th', 'Jev: ', t('pd.defect'))),
        h('tr', h('th', t('you'), ': ', t('pd.cooperate')), cell('CC', hl === 'CC'), cell('CD', hl === 'CD')),
        h('tr', h('th', t('you'), ': ', t('pd.defect')), cell('DC', hl === 'DC'), cell('DD', hl === 'DD')),
      );
    }

    function render() {
      const done = history.length >= TOTAL;
      const outcome = score[0] > score[1] ? t('result.win') : score[0] < score[1] ? t('result.lose') : t('result.draw');
      board.replaceChildren(
        h('div.scoreboard',
          h('div.sb-side', h('small', t('you')), h('b', score[0])),
          h('div.sb-mid', h('small', t('round')), h('b', `${Math.min(history.length + (done ? 0 : 1), TOTAL)} / ${TOTAL}`)),
          h('div.sb-side.right', h('small', 'Jev'), h('b', score[1])),
        ),
        h('div.timeline', Array.from({ length: TOTAL }, (_, i) => {
          const r = history[i];
          return h('div.tl-cell', { class: r ? '' : 'empty' },
            h('span.tl-dot', { class: r ? (r.opp === 'C' ? 'c' : 'd') : '' }),
            h('span.tl-dot', { class: r ? (r.jev === 'C' ? 'c' : 'd') : '' }),
          );
        })),
        last ? h('div.reveal',
          h('div.rv', { class: last.mine === 'C' ? 'c' : 'd' }, t(last.mine === 'C' ? 'pd.you_c' : 'pd.you_d'), h('b', `+${last.a}`)),
          h('div.rv', { class: last.jev === 'C' ? 'c' : 'd' }, t(last.jev === 'C' ? 'pd.jev_c' : 'pd.jev_d'), h('b', `+${last.b}`)),
        ) : null,
        done
          ? h('div.result', h('h2', outcome), h('p.muted', t('pd.final', { a: score[0], b: score[1] })), h('button.btn.lg', { onclick: reset }, t('new.game')))
          : h('div.actions',
            h('p.prompt', t('pd.choose', { n: history.length + 1 })),
            h('div.btn-row',
              h('button.btn.lg.action.good', { disabled: busy, onclick: () => play('C') }, t('pd.cooperate')),
              h('button.btn.lg.action.bad', { disabled: busy, onclick: () => play('D') }, t('pd.defect')),
            ),
          ),
        matrix(),
      );
    }

    reset();
    return { render, destroy() {} };
  },
};
