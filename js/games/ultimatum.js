// Ultimatum Game: 8 rounds, roles alternate (you propose on odd rounds, Jev on even).
// A pot of 10 coins; the proposer offers k to the responder, who accepts (split) or rejects (both 0).

import { choiceAnswer, noulAnswer } from '../engine.js';
import { POT, ROUNDS, OFFERS, profile } from '../../shared/games/ultimatum.js';

const TOTAL = ROUNDS;

// Built-in bot. Proposes around 4, adapting to what the human accepts / rejects;
// accepts 3+ almost always, smaller offers only sometimes (more often in the last round).
export function localBot({ role, round, total, offer, history }) {
  const p = profile(history);
  if (role === 'propose') {
    let target = p.minAccepted ?? 4;
    if (p.maxRejected !== null && target <= p.maxRejected) target = p.maxRejected + 1;
    target = Math.max(1, Math.min(6, target));
    const probe = p.minAccepted !== null && target > 1 && (p.maxRejected === null || target - 1 > p.maxRejected);
    const w = {};
    for (const s of OFFERS) {
      const k = Number(s);
      w[s] = Math.exp(-1.4 * Math.abs(k - target)) * (k === 0 ? 0.1 : k > 6 ? 0.3 : 1);
    }
    if (probe) w[String(target - 1)] += 0.35;
    const lowAccepted = p.accepted.some((k) => k <= 3);
    return {
      offer: choiceAnswer(w),
      human_rejects_unfair: noulAnswer(p.rejected.length ? 0.6 + 0.1 * Math.min(3, p.rejected.length) : lowAccepted ? 0.2 : 0.5),
    };
  }
  const base = [0.03, 0.25, 0.45, 0.8, 0.93, 0.98, 0.99, 0.99, 0.99, 0.99, 0.99][offer];
  let pa = base;
  if (round === total && offer > 0) pa = Math.max(pa, 0.7); // no reputation left to build
  else if (p.avgOffer !== null && p.avgOffer < 3 && offer < 4) pa *= 0.7; // punish a stingy proposer
  return {
    respond: choiceAnswer({ accept: pa, reject: 1 - pa }),
    fair: noulAnswer([0.02, 0.08, 0.15, 0.35, 0.65, 0.92, 0.95, 0.96, 0.97, 0.97, 0.97][offer]),
  };
}

export default {
  id: 'ultimatum',
  meta: { icon: '⚖️', accent: '#0ea5e9', minutes: 3 },
  strings: {
    en: {
      title: 'Ultimatum Game',
      tagline: 'Split 10 coins. Offer too little and you both walk away with nothing. How low will Jev go, and how low will it take?',
      concept: 'Fairness vs. rationality',
      rules: 'A pot of 10 coins each round, 8 rounds, roles alternate: you propose on odd rounds, Jev on even rounds. The proposer offers some coins to the responder. Accept and the coins are split that way; reject and both get nothing. Subgame-perfect equilibrium says a responder should accept anything above 0, so the proposer should offer 1. Real people reject unfair offers anyway. Can Jev tell which kind of player you are?',
      yourTurn: 'Round {n}: you propose. How many coins do you offer Jev?',
      jevTurn: 'Round {n}: Jev offers you {k} of 10 coins.',
      thinkingResp: 'Jev is weighing your offer…',
      thinkingProp: 'Jev is deciding what to offer…',
      offerBtn: 'Offer {k} to Jev',
      accept: 'Accept', reject: 'Reject',
      youKeep: 'You keep', jevGets: 'Jev gets', jevKeeps: 'Jev keeps', youGet: 'You get',
      less: 'Offer one coin less', more: 'Offer one coin more',
      jevAccepted: 'Jev accepted your offer of {k}.',
      jevRejected: 'Jev rejected your offer of {k}. Nobody gets anything.',
      youAccepted: 'You accepted Jev’s offer of {k}.',
      youRejected: 'You rejected Jev’s offer of {k}. Nobody gets anything.',
      gain: 'You +{a} · Jev +{b}',
      next: 'Next round',
      history: 'History',
      proposer: 'Proposer', split: 'Offer', result: 'Result',
      acc: 'accepted', rej: 'rejected',
      qResp: 'Accept or reject your offer?',
      qProp: 'How many coins to offer you?',
      fair: 'Offer looks fair',
      rejectsUnfair: 'You reject unfair offers',
      final: 'Final coins {a} : {b}',
      offerOf: 'offer {k}',
    },
    zh: {
      title: '最后通牒博弈',
      tagline: '分 10 枚金币。出价太低，两人都一无所得。Jev 会压到多低？又能接受多低？',
      concept: '公平与理性',
      rules: '每回合有 10 枚金币，共 8 回合，双方轮流提议：奇数回合由你提议，偶数回合由 Jev 提议。提议者决定分给回应者几枚。回应者接受就按此分配，拒绝则双方都拿不到。按子博弈完美均衡，回应者只要拿到 1 枚以上就该接受，所以提议者只需给 1 枚。可现实中人们常常拒绝不公平的分法。Jev 能看出你是哪种人吗？',
      yourTurn: '第 {n} 回合，由你提议。你分给 Jev 几枚？',
      jevTurn: '第 {n} 回合，Jev 愿意分给你 {k} 枚（共 10 枚）。',
      thinkingResp: 'Jev 正在考虑你的提议……',
      thinkingProp: 'Jev 正在考虑分你多少……',
      offerBtn: '分给 Jev {k} 枚',
      accept: '接受', reject: '拒绝',
      youKeep: '你留下', jevGets: 'Jev 得到', jevKeeps: 'Jev 留下', youGet: '你得到',
      less: '少给一枚', more: '多给一枚',
      jevAccepted: 'Jev 接受了你分给它的 {k} 枚。',
      jevRejected: 'Jev 拒绝了你分给它的 {k} 枚，双方都一无所得。',
      youAccepted: '你接受了 Jev 分给你的 {k} 枚。',
      youRejected: '你拒绝了 Jev 分给你的 {k} 枚，双方都一无所得。',
      gain: '你 +{a} · Jev +{b}',
      next: '下一回合',
      history: '历史',
      proposer: '提议者', split: '分给对方', result: '结果',
      acc: '接受', rej: '拒绝',
      qResp: '接受还是拒绝你的提议？',
      qProp: '分给你几枚？',
      fair: '认为提议公平',
      rejectsUnfair: '你会拒绝不公平的提议',
      final: '最终金币 {a} : {b}',
      offerOf: '分 {k} 枚',
    },
  },

  mount(board, ctx) {
    const { t, h, panel } = ctx;
    let alive = true;
    let round, history, score, phase, draft, jevOffer, last;
    // phase: 'propose' (you pick an offer) | 'thinking' | 'respond' (you answer Jev) | 'reveal' | 'done'

    function reset() {
      round = 1;
      history = []; // { proposer: 'human'|'jev', offer, accepted }
      score = { human: 0, jev: 0 };
      phase = 'propose';
      draft = 5;
      jevOffer = null;
      last = null;
      panel.waiting();
      render();
    }

    const payloadBase = () => ({ round, total: TOTAL, history: history.map((x) => ({ ...x })) });

    function record(proposer, offer, accepted) {
      const gHuman = accepted ? (proposer === 'human' ? POT - offer : offer) : 0;
      const gJev = accepted ? (proposer === 'jev' ? POT - offer : offer) : 0;
      history.push({ proposer, offer, accepted });
      score = { human: score.human + gHuman, jev: score.jev + gJev };
      last = { proposer, offer, accepted, gHuman, gJev };
      phase = round >= TOTAL ? 'done' : 'reveal';
    }

    async function submitOffer() {
      if (phase !== 'propose' || !alive) return;
      const offer = draft;
      phase = 'thinking';
      jevOffer = null;
      render();
      panel.thinking();
      const res = await ctx.decide('ultimatum', { role: 'respond', offer, ...payloadBase() }, localBot);
      if (!alive) return;
      const act = ctx.pickAction(res.answers.respond, ['accept', 'reject']);
      record('human', offer, act === 'accept');
      panel.show(res, {
        question: 'respond',
        labels: () => ({ accept: t('ultimatum.accept'), reject: t('ultimatum.reject') }),
        picked: act,
        title: () => t('ultimatum.qResp'),
        extras: () => [{ label: t('ultimatum.fair'), value: res.answers.fair?.noul }],
      });
      render();
    }

    async function jevPropose() {
      phase = 'thinking';
      render();
      panel.thinking();
      const res = await ctx.decide('ultimatum', { role: 'propose', ...payloadBase() }, localBot);
      if (!alive) return;
      const pick = ctx.pickAction(res.answers.offer, OFFERS);
      jevOffer = Number(pick);
      phase = 'respond';
      panel.show(res, {
        question: 'offer',
        labels: () => Object.fromEntries(OFFERS.map((s) => [s, t('ultimatum.offerOf', { k: s })])),
        picked: pick,
        title: () => t('ultimatum.qProp'),
        extras: () => [{ label: t('ultimatum.rejectsUnfair'), value: res.answers.human_rejects_unfair?.noul }],
      });
      render();
    }

    function respond(accepted) {
      if (phase !== 'respond' || !alive) return;
      record('jev', jevOffer, accepted);
      render();
    }

    function next() {
      if (phase !== 'reveal' || !alive) return;
      round += 1;
      last = null;
      jevOffer = null;
      panel.waiting();
      if (round % 2 === 0) jevPropose();
      else { phase = 'propose'; render(); }
    }

    function setDraft(k) {
      if (phase !== 'propose') return;
      draft = Math.max(0, Math.min(POT, k));
      render();
    }

    // Ten coins; the first (10 - k) stay with the proposer, the last k go to the responder.
    function coins(k, { interactive = false, burned = false, proposer = 'human' } = {}) {
      const keepLabel = proposer === 'human' ? t('ultimatum.youKeep') : t('ultimatum.jevKeeps');
      const giveLabel = proposer === 'human' ? t('ultimatum.jevGets') : t('ultimatum.youGet');
      return h('div.ug-split', { class: `${burned ? 'burned' : ''} ${proposer === 'human' ? 'you-prop' : 'jev-prop'}` },
        h('div.ug-coins', Array.from({ length: POT }, (_, i) => {
          const give = i >= POT - k;
          const attrs = { class: give ? 'give' : 'keep', style: `--i:${i}` };
          if (interactive) {
            attrs.type = 'button';
            attrs.title = t('ultimatum.offerOf', { k: POT - i });
            attrs.onclick = () => setDraft(POT - i);
            return h('button.ug-coin', attrs);
          }
          return h('span.ug-coin', attrs);
        })),
        h('div.ug-legend',
          h('span.keep', h('i'), keepLabel, ' ', h('b', POT - k)),
          h('span.give', giveLabel, ' ', h('b', k), h('i')),
        ),
      );
    }

    function stage() {
      if (phase === 'propose') {
        return h('div.actions.ug-stage',
          h('p.prompt', t('ultimatum.yourTurn', { n: round })),
          coins(draft, { interactive: true, proposer: 'human' }),
          h('div.ug-stepper',
            h('button.btn.ghost.ug-step', { type: 'button', 'aria-label': t('ultimatum.less'), disabled: draft <= 0, onclick: () => setDraft(draft - 1) }, '−'),
            h('input.ug-range', {
              type: 'range', min: 0, max: POT, step: 1, value: draft, 'aria-label': t('ultimatum.split'),
              oninput: (e) => { draft = Number(e.target.value); refreshDraft(); },
              onchange: () => render(),
            }),
            h('button.btn.ghost.ug-step', { type: 'button', 'aria-label': t('ultimatum.more'), disabled: draft >= POT, onclick: () => setDraft(draft + 1) }, '+'),
          ),
          h('div.btn-row', h('button.btn.lg', { onclick: submitOffer }, t('ultimatum.offerBtn', { k: draft }))),
        );
      }
      if (phase === 'thinking') {
        const humanProp = round % 2 === 1;
        return h('div.actions.ug-stage',
          h('p.prompt', t(humanProp ? 'ultimatum.thinkingResp' : 'ultimatum.thinkingProp')),
          humanProp ? coins(draft, { proposer: 'human' }) : h('div.ug-split.ug-wait', h('div.ug-coins', Array.from({ length: POT }, (_, i) => h('span.ug-coin', { style: `--i:${i}` })))),
        );
      }
      if (phase === 'respond') {
        return h('div.actions.ug-stage',
          h('p.prompt', t('ultimatum.jevTurn', { n: round, k: jevOffer })),
          coins(jevOffer, { proposer: 'jev' }),
          h('div.btn-row',
            h('button.btn.lg.action.good', { onclick: () => respond(true) }, t('ultimatum.accept')),
            h('button.btn.lg.action.bad', { onclick: () => respond(false) }, t('ultimatum.reject')),
          ),
        );
      }
      // reveal / done
      const L = last;
      const msg = L.proposer === 'human'
        ? t(L.accepted ? 'ultimatum.jevAccepted' : 'ultimatum.jevRejected', { k: L.offer })
        : t(L.accepted ? 'ultimatum.youAccepted' : 'ultimatum.youRejected', { k: L.offer });
      return h('div.ug-stage.ug-reveal', { class: L.accepted ? 'ok' : 'no' },
        h('p.ug-msg', msg),
        coins(L.offer, { proposer: L.proposer, burned: !L.accepted }),
        h('p.ug-gain', t('ultimatum.gain', { a: L.gHuman, b: L.gJev })),
        phase === 'reveal' ? h('div.btn-row', h('button.btn.lg', { onclick: next }, t('ultimatum.next'))) : null,
      );
    }

    // Update the draft visuals while dragging the slider without rebuilding the input.
    function refreshDraft() {
      const split = board.querySelector('.ug-split');
      if (!split) return;
      split.querySelectorAll('.ug-coin').forEach((c, i) => {
        const give = i >= POT - draft;
        c.classList.toggle('give', give);
        c.classList.toggle('keep', !give);
      });
      const [keepB, giveB] = split.querySelectorAll('.ug-legend b');
      if (keepB) keepB.textContent = POT - draft;
      if (giveB) giveB.textContent = draft;
      const btn = board.querySelector('.ug-stage .btn-row .btn');
      if (btn) btn.textContent = t('ultimatum.offerBtn', { k: draft });
    }

    function historyTable() {
      if (!history.length) return null;
      return h('div.ug-hist',
        h('small.muted', t('ultimatum.history')),
        h('div.ug-rows', history.map((r, i) => {
          const humanProp = r.proposer === 'human';
          const gh = r.accepted ? (humanProp ? POT - r.offer : r.offer) : 0;
          const gj = r.accepted ? (humanProp ? r.offer : POT - r.offer) : 0;
          return h('div.ug-row', { class: r.accepted ? 'ok' : 'no' },
            h('span.ug-rn', i + 1),
            h('span.ug-who', humanProp ? t('you') : 'Jev', ' → ', humanProp ? 'Jev' : t('you')),
            h('span.ug-bar', h('span.ug-bar-fill', { style: { width: `${r.offer * 10}%` } }), h('b', r.offer)),
            h('span.ug-res', r.accepted ? `✓ ${t('ultimatum.acc')}` : `✗ ${t('ultimatum.rej')}`),
            h('span.ug-g', `${gh} : ${gj}`),
          );
        })),
      );
    }

    function render() {
      if (!alive) return;
      const done = phase === 'done';
      const outcome = score.human > score.jev ? t('result.win') : score.human < score.jev ? t('result.lose') : t('result.draw');
      board.replaceChildren(
        h('div.scoreboard',
          h('div.sb-side', h('small', t('you')), h('b', score.human)),
          h('div.sb-mid', h('small', t('round')), h('b', `${round} / ${TOTAL}`)),
          h('div.sb-side.right', h('small', 'Jev'), h('b', score.jev)),
        ),
        h('div.ug-roles', Array.from({ length: TOTAL }, (_, i) => h('span.ug-role', {
          class: `${i % 2 === 0 ? 'you' : 'jev'} ${i + 1 === round && !done ? 'now' : ''} ${i < history.length ? (history[i].accepted ? 'ok' : 'no') : ''}`,
          title: `${i + 1}: ${t('ultimatum.proposer')} ${i % 2 === 0 ? t('you') : 'Jev'}`,
        }, i % 2 === 0 ? t('you')[0] : 'J'))),
        stage(),
        done ? h('div.result', h('h2', outcome), h('p.muted', t('ultimatum.final', { a: score.human, b: score.jev })), h('button.btn.lg', { onclick: reset }, t('new.game'))) : null,
        historyTable(),
      );
    }

    reset();
    return {
      render,
      destroy() { alive = false; },
    };
  },
};
