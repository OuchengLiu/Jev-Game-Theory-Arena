// Ultimatum Game: 8 rounds, roles alternate (you propose on odd rounds, Jev on even).
// A pot of 10 coins; the proposer offers k to the responder, who accepts (split) or rejects (both 0).

import { choiceAnswer, noulAnswer } from '../engine.js';
import { POT, ROUNDS, OFFERS, profile } from '../../shared/games/ultimatum.js';

const TOTAL = ROUNDS;

// Practice bot (automatic fallback when Jev is unreachable). Proposes around 4, adapting to what the human accepts / rejects;
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

// ---------- SVG (code-controlled markup; translated text is escaped) ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function svg(markup) {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  return tpl.content.firstElementChild;
}
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// One gold coin symbol per board (gradients live in the sprite; coins <use> it).
const SPRITE = `<svg class="ug-sprite" aria-hidden="true" focusable="false"><defs>
<radialGradient id="ug-face" cx="36%" cy="30%" r="75%"><stop offset="0" stop-color="#fbf0cf"/><stop offset=".38" stop-color="#ecd9a6"/><stop offset=".72" stop-color="#c9a45c"/><stop offset="1" stop-color="#a47f38"/></radialGradient>
<linearGradient id="ug-edge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8914a"/><stop offset="1" stop-color="#7a5a22"/></linearGradient>
<symbol id="ug-coin" viewBox="0 0 40 40">
<circle cx="20" cy="21.6" r="18.4" fill="url(#ug-edge)"/>
<circle cx="20" cy="19.6" r="18" fill="url(#ug-face)"/>
<circle cx="20" cy="19.6" r="14.2" fill="none" stroke="#8a6526" stroke-opacity=".45" stroke-width="1"/>
<circle cx="20" cy="19.6" r="15.6" fill="none" stroke="#fff6d8" stroke-opacity=".5" stroke-width=".7" stroke-dasharray="1.2 1.6"/>
<path d="M20 11.4l2.1 6.1 6.1 2.1-6.1 2.1-2.1 6.1-2.1-6.1-6.1-2.1 6.1-2.1z" fill="#8a6526" fill-opacity=".5"/>
<path d="M9.5 13.5a12.5 12.5 0 0 1 8-6.2" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.6" stroke-linecap="round"/>
</symbol></defs></svg>`;
const coinSvg = () => '<svg viewBox="0 0 40 40" aria-hidden="true"><use href="#ug-coin"/></svg>';
const ICON = {
  ok: '<svg viewBox="0 0 24 24" aria-hidden="true" class="ug-ico"><circle cx="12" cy="12" r="9.5"/><path d="M7.8 12.3l2.8 2.8 5.6-6"/></svg>',
  no: '<svg viewBox="0 0 24 24" aria-hidden="true" class="ug-ico"><circle cx="12" cy="12" r="9.5"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
  arrow: '<svg viewBox="0 0 40 16" aria-hidden="true" class="ug-arrow"><path d="M2 8h34M29 2.5L36 8l-7 5.5"/></svg>',
};

export default {
  id: 'ultimatum',
  meta: { icon: 'scale', accent: '#0ea5e9', minutes: 3, version: '1.1' },
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
      pot: 'Pot',
      coins: 'coins',
      propRole: 'Proposer', respRole: 'Responder',
      giveCoin: 'Give this coin to Jev', takeCoin: 'Take this coin back',
      notMoney: 'Play coins only. Nothing here is real money.',
      keepAll: 'keep all', giveAll: 'give all',
      rd: 'Rd', splitCol: 'Split (you | Jev)', youCol: 'You', jevCol: 'Jev',
      acceptRate: 'Accepted {a} of {n} offers',
      youOffered: 'Your average offer: {x}',
      jevOffered: 'Jev’s average offer: {x}',
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
      pot: '奖池',
      coins: '枚',
      propRole: '提议者', respRole: '回应者',
      giveCoin: '把这枚分给 Jev', takeCoin: '收回这枚',
      notMoney: '仅为游戏金币，不涉及任何真实金钱。',
      keepAll: '全留下', giveAll: '全给出',
      rd: '回合', splitCol: '分配（你 | Jev）', youCol: '你', jevCol: 'Jev',
      acceptRate: '{n} 次提议中有 {a} 次被接受',
      youOffered: '你的平均出价：{x}',
      jevOffered: 'Jev 的平均出价：{x}',
    },
  },

  mount(board, ctx) {
    const { t, h, panel } = ctx;
    let alive = true;
    let round, history, score, phase, draft, jevOffer, last, fresh;
    // phase: 'propose' (you pick an offer) | 'thinking' | 'respond' (you answer Jev) | 'reveal' | 'done'
    // anonymous telemetry: never allowed to break the game
    const track = (fn, ...a) => { try { ctx.track?.[fn]?.(...a); } catch { /* ignore */ } };
    const trackEnd = () => { if (phase === 'done') track('end', score.human > score.jev ? 'win' : score.human < score.jev ? 'lose' : 'draw'); };

    function reset() {
      track('start');
      round = 1;
      history = []; // { proposer: 'human'|'jev', offer, accepted } — exactly what the schema allows
      score = { human: 0, jev: 0 };
      phase = 'propose';
      draft = 5;
      jevOffer = null;
      last = null;
      fresh = false;
      panel.clearSealed();
      panel.waiting();
      update();
    }

    const payloadBase = () => ({ round, total: TOTAL, history: history.map((x) => ({ ...x })) });

    function record(proposer, offer, accepted) {
      const gHuman = accepted ? (proposer === 'human' ? POT - offer : offer) : 0;
      const gJev = accepted ? (proposer === 'jev' ? POT - offer : offer) : 0;
      history.push({ proposer, offer, accepted });
      score = { human: score.human + gHuman, jev: score.jev + gJev };
      last = { proposer, offer, accepted, gHuman, gJev };
      phase = round >= TOTAL ? 'done' : 'reveal';
      fresh = true;
    }

    async function submitOffer() {
      if (phase !== 'propose' || !alive) return;
      const offer = draft;
      phase = 'thinking';
      jevOffer = null;
      update();
      panel.thinking();
      track('human', { ph: `r${round}`, act: `o${offer}` });
      const payload = { role: 'respond', offer, ...payloadBase() };
      const res = await ctx.decide('ultimatum', () => payload, localBot);
      if (!alive) return;
      const act = ctx.pickAction(res.answers?.respond, ['accept', 'reject']);
      track('opp', res, { ph: `r${round}`, act, x: String(offer) });
      record('human', offer, act === 'accept');
      trackEnd();
      panel.show(res, {
        question: 'respond',
        labels: () => ({ accept: t('ultimatum.accept'), reject: t('ultimatum.reject') }),
        picked: act,
        title: () => t('ultimatum.qResp'),
        extras: () => [{ label: t('ultimatum.fair'), value: res.answers?.fair?.noul }],
      });
      update();
    }

    async function jevPropose() {
      phase = 'thinking';
      update();
      panel.thinking();
      const payload = { role: 'propose', ...payloadBase() };
      const res = await ctx.decide('ultimatum', () => payload, localBot);
      if (!alive) return;
      const pick = ctx.pickAction(res.answers?.offer, OFFERS);
      jevOffer = Number(pick);
      track('opp', res, { ph: `r${round}`, act: `o${jevOffer}` });
      phase = 'respond';
      // Jev modes: its odds stay sealed until you've answered (they'd hint how low it can go).
      panel.reveal(res, {
        question: 'offer',
        labels: () => Object.fromEntries(OFFERS.map((s) => [s, t('ultimatum.offerOf', { k: s })])),
        picked: pick,
        title: () => t('ultimatum.qProp'),
        extras: () => [{ label: t('ultimatum.rejectsUnfair'), value: res.answers?.human_rejects_unfair?.noul }],
      });
      update();
    }

    function respond(accepted) {
      if (phase !== 'respond' || !alive) return;
      track('human', { ph: `r${round}`, act: accepted ? 'accept' : 'reject', x: String(jevOffer) });
      record('jev', jevOffer, accepted);
      trackEnd();
      panel.unseal();
      update();
    }

    function next() {
      if (phase !== 'reveal' || !alive) return;
      round += 1;
      last = null;
      jevOffer = null;
      // (the panel keeps the last read, e.g. the review of Jev's offer, until Jev thinks again)
      if (round % 2 === 0) jevPropose();
      else { phase = 'propose'; draft = 5; update(); }
    }

    function setDraft(k) {
      if (phase !== 'propose') return;
      const v = Math.max(0, Math.min(POT, k));
      if (v === draft) return;
      draft = v;
      refreshDraft();
    }

    // ---------- FLIP: coins keep their identity (data-i) and glide between trays / pot ----------
    function flip(mutate) {
      const before = new Map();
      board.querySelectorAll('.ug-coin[data-i]').forEach((c) => before.set(c.dataset.i, c.getBoundingClientRect()));
      mutate();
      if (reduced()) return;
      const moved = [];
      board.querySelectorAll('.ug-coin[data-i]').forEach((c) => {
        const a = before.get(c.dataset.i);
        const b = c.getBoundingClientRect();
        if (!a) return;
        const dx = a.left - b.left;
        const dy = a.top - b.top;
        const s = a.width / (b.width || 1);
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(s - 1) < 0.02) return;
        moved.push([c, dx, dy, s]);
      });
      moved.forEach(([c, dx, dy, s], n) => {
        c.animate([
          { transform: `translate(${dx}px, ${dy}px) scale(${s})` },
          { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 16}px) scale(${(s + 1) / 2 * 1.12})`, offset: 0.5 },
          { transform: 'none' },
        ], { duration: 560, delay: Math.min(n, 9) * 45, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'backwards' });
      });
    }

    // ---------- the table: your tray · pot · Jev's tray ----------
    // Which coins sit where: `left` coins (0..left-1) in your tray, the rest in Jev's tray
    // in reverse order, so moving the split by one moves exactly one coin.
    function table({ left, pot = false, interactive = false, burned = false, proposer = 'human', counts = true } = {}) {
      const coin = (i, where) => {
        const attrs = { 'data-i': i, class: `${burned ? 'burned' : ''}`, style: { '--i': i }, html: coinSvg() };
        if (interactive) {
          attrs.type = 'button';
          attrs['aria-label'] = where === 'left' ? t('ultimatum.giveCoin') : t('ultimatum.takeCoin');
          attrs.onclick = () => setDraft(draft + (where === 'left' ? 1 : -1));
          return h('button.ug-coin', attrs);
        }
        return h('span.ug-coin', attrs);
      };
      const leftCoins = pot ? [] : Array.from({ length: left }, (_, i) => coin(i, 'left'));
      const rightCoins = pot ? [] : Array.from({ length: POT - left }, (_, j) => coin(POT - 1 - j, 'right'));
      const potCoins = pot ? Array.from({ length: POT }, (_, i) => coin(i, 'pot')) : [];
      const humanProp = proposer === 'human';
      const tray = (who, coins, n) => {
        const you = who === 'you';
        const isProp = you === humanProp;
        const label = you ? (isProp ? t('ultimatum.youKeep') : t('ultimatum.youGet')) : (isProp ? t('ultimatum.jevKeeps') : t('ultimatum.jevGets'));
        const gain = last && fresh && (phase === 'reveal' || phase === 'done') && last.accepted ? (you ? last.gHuman : last.gJev) : null;
        return h('div.ug-tray', { class: `${who} ${isProp ? 'prop' : 'resp'}` },
          h('div.ug-tray-head',
            h('span.ug-who', you ? t('you') : t('opp'), h('em', isProp ? t('ultimatum.propRole') : t('ultimatum.respRole'))),
            counts ? h('span.ug-count', h('small', label), h('b', { class: burned ? 'burned' : '' }, n)) : null),
          h('div.ug-dish', coins, gain !== null ? h('span.ug-gain', `+${gain}`) : null),
        );
      };
      return h('div.ug-table', { class: `${pot ? 'is-pot' : ''} ${burned ? 'is-burned' : ''} ${humanProp ? 'you-prop' : 'jev-prop'}` },
        tray('you', leftCoins, left),
        h('div.ug-mid',
          h('div.ug-pot', { 'aria-label': t('ultimatum.pot') }, potCoins),
          pot ? h('small.ug-pot-lab', t('ultimatum.pot')) : h('div.ug-flow', { class: humanProp ? 'to-right' : 'to-left' },
            h('span', { html: ICON.arrow }), h('b', humanProp ? POT - left : left))),
        tray('jev', rightCoins, POT - left),
      );
    }

    function slider() {
      return h('div.ug-slider',
        h('button.ug-step', { type: 'button', 'aria-label': t('ultimatum.less'), disabled: draft <= 0, onclick: () => setDraft(draft - 1) }, svg('<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9"/></svg>')),
        h('div.ug-range-wrap',
          h('input.ug-range', {
            type: 'range', min: 0, max: POT, step: 1, value: draft, 'aria-label': t('ultimatum.split'),
            style: { '--p': `${draft * 10}%` },
            oninput: (e) => setDraft(Number(e.target.value)),
          }),
          h('div.ug-ticks', Array.from({ length: POT + 1 }, (_, k) => h('span', { class: k === draft ? 'on' : '' }, k))),
        ),
        h('button.ug-step', { type: 'button', 'aria-label': t('ultimatum.more'), disabled: draft >= POT, onclick: () => setDraft(draft + 1) }, svg('<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9M8 3.5v9"/></svg>')),
      );
    }

    // Update the draft (slider / steppers / coin clicks) without rebuilding the slider mid-drag.
    function refreshDraft() {
      const old = board.querySelector('.ug-table');
      if (!old) return;
      flip(() => old.replaceWith(table({ left: POT - draft, interactive: true, proposer: 'human' })));
      const r = board.querySelector('.ug-range');
      if (r) {
        if (Number(r.value) !== draft) r.value = String(draft);
        r.style.setProperty('--p', `${draft * 10}%`);
      }
      board.querySelectorAll('.ug-ticks span').forEach((s, k) => s.classList.toggle('on', k === draft));
      const [less, more] = board.querySelectorAll('.ug-step');
      if (less) less.disabled = draft <= 0;
      if (more) more.disabled = draft >= POT;
      const btn = board.querySelector('.ug-offer');
      if (btn) btn.textContent = t('ultimatum.offerBtn', { k: draft });
    }

    function stage() {
      if (phase === 'propose') {
        return [
          h('p.ug-prompt', t('ultimatum.yourTurn', { n: round })),
          table({ left: POT - draft, interactive: true, proposer: 'human' }),
          slider(),
          h('div.btn-row', h('button.btn.lg.ug-offer', { onclick: submitOffer }, t('ultimatum.offerBtn', { k: draft }))),
        ];
      }
      if (phase === 'thinking') {
        const humanProp = round % 2 === 1;
        return [
          h('p.ug-prompt.wait', t(humanProp ? 'ultimatum.thinkingResp' : 'ultimatum.thinkingProp'), h('i.ug-dots', h('i'), h('i'), h('i'))),
          humanProp ? table({ left: POT - draft, proposer: 'human' }) : table({ left: 0, pot: true, proposer: 'jev', counts: false }),
        ];
      }
      if (phase === 'respond') {
        return [
          h('p.ug-prompt', t('ultimatum.jevTurn', { n: round, k: jevOffer })),
          table({ left: jevOffer, proposer: 'jev' }),
          h('div.btn-row',
            h('button.btn.lg.action.good.ug-respond', { onclick: () => respond(true) }, t('ultimatum.accept')),
            h('button.btn.lg.action.bad.ug-respond', { onclick: () => respond(false) }, t('ultimatum.reject'))),
        ];
      }
      // reveal / done
      const L = last;
      const msg = L.proposer === 'human'
        ? t(L.accepted ? 'ultimatum.jevAccepted' : 'ultimatum.jevRejected', { k: L.offer })
        : t(L.accepted ? 'ultimatum.youAccepted' : 'ultimatum.youRejected', { k: L.offer });
      const left = L.proposer === 'human' ? POT - L.offer : L.offer;
      return [
        h('p.ug-verdict', { class: L.accepted ? 'ok' : 'no' }, h('span', { html: L.accepted ? ICON.ok : ICON.no }), msg),
        L.accepted
          ? table({ left, proposer: L.proposer })
          : table({ left, pot: true, burned: true, proposer: L.proposer, counts: false }),
        phase === 'reveal' ? h('div.btn-row', h('button.btn.lg.ug-next', { onclick: next }, t('ultimatum.next'))) : null,
      ];
    }

    function header() {
      const done = phase === 'done';
      return h('div.ug-head',
        h('div.ug-sc.you', h('small', t('you')), h('div', h('span.ug-sc-coin', { html: coinSvg() }), h('b', score.human))),
        h('div.ug-mid-head',
          h('div.ug-round', h('small', t('round')), h('b', round), h('span', `/ ${TOTAL}`)),
          h('div.ug-roles', Array.from({ length: TOTAL }, (_, i) => h('span.ug-role', {
            class: `${i % 2 === 0 ? 'you' : 'jev'} ${i + 1 === round && !done ? 'now' : ''} ${i < history.length ? (history[i].accepted ? 'ok' : 'no') : ''}`,
            title: `${i + 1}: ${t('ultimatum.proposer')} ${i % 2 === 0 ? t('you') : t('opp')}`,
          }, i % 2 === 0 ? t('you').slice(0, 1) : t('opp').slice(0, 1)))),
        ),
        h('div.ug-sc.jev', h('small', t('opp')), h('div', h('b', score.jev), h('span.ug-sc-coin', { html: coinSvg() }))),
      );
    }

    function historyTable() {
      if (!history.length) return null;
      return h('div.ug-hist',
        h('div.ug-cap', t('ultimatum.history')),
        h('div.ug-hist-scroll', h('table.ug-htable',
          h('thead', h('tr',
            h('th', t('ultimatum.rd')), h('th', t('ultimatum.proposer')), h('th.split', t('ultimatum.splitCol')),
            h('th', t('ultimatum.result')), h('th.num', t('ultimatum.youCol')), h('th.num', t('ultimatum.jevCol')))),
          h('tbody', history.map((r, i) => {
            const humanProp = r.proposer === 'human';
            const youShare = humanProp ? POT - r.offer : r.offer;
            const gh = r.accepted ? youShare : 0;
            const gj = r.accepted ? POT - youShare : 0;
            return h('tr', { class: `${r.accepted ? 'ok' : 'no'} ${fresh && i === history.length - 1 ? 'fresh' : ''}` },
              h('td.rn', i + 1),
              h('td', h('span.ug-pdot', { class: humanProp ? 'you' : 'jev' }), humanProp ? t('you') : t('opp')),
              h('td.split', h('span.ug-seg', Array.from({ length: POT }, (_, k) => h('i', { class: k < youShare ? 'y' : 'j' }))),
                h('span.ug-seg-n', `${youShare} | ${POT - youShare}`)),
              h('td', h('span.ug-res', { class: r.accepted ? 'ok' : 'no', html: r.accepted ? ICON.ok : ICON.no }), h('span.ug-res-t', t(r.accepted ? 'ultimatum.acc' : 'ultimatum.rej'))),
              h('td.num', { class: gh ? '' : 'zero' }, `+${gh}`),
              h('td.num', { class: gj ? '' : 'zero' }, `+${gj}`),
            );
          })),
        )),
      );
    }

    function result() {
      const outcome = score.human > score.jev ? t('result.win') : score.human < score.jev ? t('result.lose') : t('result.draw');
      const avg = (who) => {
        const o = history.filter((r) => r.proposer === who).map((r) => r.offer);
        return o.length ? (o.reduce((a, b) => a + b, 0) / o.length).toFixed(1) : '—';
      };
      return h('div.ug-result', { class: score.human > score.jev ? 'win' : score.human < score.jev ? 'lose' : 'draw' },
        h('h2', outcome),
        h('p.ug-final', t('ultimatum.final', { a: score.human, b: score.jev })),
        h('p.muted.ug-avg', t('ultimatum.youOffered', { x: avg('human') }), ' · ', t('ultimatum.jevOffered', { x: avg('jev') })),
        h('button.btn.lg', { onclick: reset }, t('new.game')),
      );
    }

    function render() {
      if (!alive) return;
      board.replaceChildren(...[
        svg(SPRITE),
        header(),
        h('div.ug-stage', { class: `ph-${phase}` }, stage()),
        phase === 'done' ? result() : null,
        h('p.ug-note', t('ultimatum.notMoney')),
        historyTable(),
      ].filter(Boolean));
      fresh = false;
    }

    // Full re-render with coins gliding from where they were.
    function update() {
      flip(render);
    }

    reset();
    return {
      render,
      destroy() { alive = false; panel.clearSealed(); },
    };
  },
};
