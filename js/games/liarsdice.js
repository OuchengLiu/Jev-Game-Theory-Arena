// Liar's Dice (heads-up). Follows the module contract described in js/games/pd.js.
// Pure rules / probabilities live in ./liarsdice-core.js (Node-testable); this file is UI.

import { choiceAnswer, noulAnswer } from '../engine.js';
import {
  FACES, START_DICE, rollDice, countFace, isLegalBid, minQty, bidProb, bucket,
  makePayload, makeRawPayload, recordBids, resolveChallenge, botWeights,
} from './liarsdice-core.js';

// Practice bot (automatic fallback when Jev is unreachable): likelihood-based mixed
// strategy with occasional bluffs (see botWeights). Always receives the hinted payload.
function localBot(payload) {
  const { action, oppBluff } = botWeights(payload);
  const out = { action: choiceAnswer(action) };
  if (oppBluff != null) out.opp_bluffing = noulAnswer(oppBluff);
  return out;
}

// Pip positions on a 3x3 grid (0..8, row-major).
const PIPS = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const PANEL_TOP = 6; // options shown in Jev's panel (by probability)
const TIMELINE_MAX = 6; // most recent bids drawn on the mat

// Resting tilt / tumble parameters per die slot, so the dice look scattered, not gridded.
const TILT = [-5, 3, -2, 6, -4];
const SPIN = [-200, 150, -120, 230, -170];
const DRIFT = [-14, 9, -5, 12, -9];

// ---- inline SVG dice cups (leather, stitched, brass rim) ----
const BRASS = '<stop offset="0" stop-color="#6f5020"/><stop offset=".28" stop-color="#ecd9a6"/><stop offset=".55" stop-color="#c9a45c"/><stop offset="1" stop-color="#7d5a21"/>';
const LEATHER = '<stop offset="0" stop-color="#1f0f08"/><stop offset=".3" stop-color="#6a3a22"/><stop offset=".55" stop-color="#4f2a17"/><stop offset="1" stop-color="#170a05"/>';
function cupSvg(id, open) {
  const defs = `<defs><linearGradient id="${id}l" x1="0" x2="1">${LEATHER}</linearGradient>`
    + `<linearGradient id="${id}b" x1="0" x2="1">${BRASS}</linearGradient>`
    + `<radialGradient id="${id}t" cx=".42" cy=".3" r=".9"><stop offset="0" stop-color="${open ? '#2b170c' : '#6a3d24'}"/><stop offset="1" stop-color="${open ? '#070302' : '#1d0e07'}"/></radialGradient></defs>`;
  const body = open
    // standing, mouth up (set aside after rolling)
    ? `<path d="M10 22 Q60 34 110 22 L97 90 Q60 99 23 90 Z" fill="url(#${id}l)"/>`
      + '<path d="M34 30 L30 92 Q36 94 42 95 L46 33 Z" fill="#fff" opacity=".07"/>'
      + '<path d="M13 40 Q60 52 107 40" fill="none" stroke="#ecd9a6" stroke-width="1" stroke-dasharray="2.5 3" opacity=".7"/>'
      + '<path d="M25 82 Q60 90 95 82" fill="none" stroke="#ecd9a6" stroke-width="1" stroke-dasharray="2.5 3" opacity=".5"/>'
      + `<path d="M10 22 Q60 34 110 22 L109 30 Q60 42 11 30 Z" fill="url(#${id}b)"/>`
      + `<ellipse cx="60" cy="22" rx="50" ry="10" fill="url(#${id}t)"/>`
      + `<ellipse cx="60" cy="22" rx="50" ry="10" fill="none" stroke="url(#${id}b)" stroke-width="2.2"/>`
    // upside down, covering the dice
    : `<path d="M24 16 L10 84 Q60 97 110 84 L96 16 Z" fill="url(#${id}l)"/>`
      + '<path d="M37 21 L28 86 Q34 88 40 89 L47 22 Z" fill="#fff" opacity=".08"/>'
      + '<path d="M25 27 Q60 36 95 27" fill="none" stroke="#ecd9a6" stroke-width="1" stroke-dasharray="2.5 3" opacity=".55"/>'
      + '<path d="M13 70 Q60 82 107 70" fill="none" stroke="#ecd9a6" stroke-width="1" stroke-dasharray="2.5 3" opacity=".75"/>'
      + `<path d="M11 77 Q60 89 109 77 L110 84 Q60 97 10 84 Z" fill="url(#${id}b)"/>`
      + '<path d="M10 84 Q60 97 110 84" fill="none" stroke="#3d2a0c" stroke-width="1"/>'
      + `<ellipse cx="60" cy="16" rx="36" ry="7.5" fill="url(#${id}t)"/>`
      + `<ellipse cx="60" cy="16" rx="36" ry="7.5" fill="none" stroke="url(#${id}b)" stroke-width="2"/>`
      + '<ellipse cx="60" cy="16" rx="29" ry="5" fill="none" stroke="#ecd9a6" stroke-width=".9" stroke-dasharray="2 2.6" opacity=".5"/>';
  return `<svg viewBox="0 0 120 100" aria-hidden="true" focusable="false">${defs}${body}</svg>`;
}

export default {
  id: 'liarsdice',
  meta: { icon: '🎲', accent: '#c9a45c', minutes: 6, version: '1.3' },
  strings: {
    en: {
      title: 'Liar’s Dice',
      tagline: 'Five dice under a cup, one question: is Jev telling the truth about the dice it can’t see?',
      concept: 'Bluffing & Bayesian beliefs',
      rules: 'You and Jev each roll 5 hidden dice. Take turns bidding “at least N dice showing face F” across both cups. 1s are wild and count as every face, so you can’t bid on 1s. Each bid must be higher: more dice, or the same number with a higher face. Or call “Liar!”: if the bid is true the caller loses a die, otherwise the bidder does. The loser starts the next round. Lose all your dice and you lose.',
      you: 'You', jev: 'Jev', round: 'Round',
      diceLeft: '{n} dice left', dieLeft: '1 die left',
      awaiting: 'Awaiting the opening bid',
      jevOpening: 'Jev is opening',
      bids_jev: 'Jev bids', bids_you: 'You bid',
      history: 'This round',
      youOpen: 'You open the round. Make a bid.',
      yourTurn: 'Your turn: raise the bid or call Liar',
      jevTurn: 'Jev is weighing its move',
      bidLabel: '{q} × {f}s',
      bidBtn: 'Bid {q} ×',
      liar: 'Liar!',
      qty: 'Quantity',
      face: 'Face',
      wild: '1s are wild',
      hint: 'From your dice alone: {lk} ({p})',
      lk_certain: 'certain', lk_very_likely: 'very likely', lk_likely: 'likely', lk_coin_flip: 'a coin flip',
      lk_unlikely: 'unlikely', lk_very_unlikely: 'very unlikely', lk_impossible: 'impossible',
      calls_you: 'You call Liar on Jev’s bid',
      calls_jev: 'Jev calls Liar on your bid',
      revealing: 'Lifting the cup',
      tallyNeed: 'bid {q}',
      bidTrue: 'The bid was true',
      bidFalse: 'The bid was false',
      youLose: 'You lose a die.',
      jevLoses: 'Jev loses a die.',
      nextRound: 'Next round',
      win: 'You win the match',
      lose: 'Jev wins the match',
      matchWin: 'You took Jev’s last die.',
      matchLose: 'Jev took your last die.',
      newGame: 'New game',
      q: 'Raise or call Liar?',
      qOpen: 'Opening bid',
      mvOpen: 'Opening · Jev bids {bid}', mvRaise: 'Jev raises to {bid}', mvLiar: 'Jev calls Liar on {bid}',
      thinksBluff: 'Thinks you’re bluffing',
      caption: 'For fun and learning · no real money',
      jevDice: 'Jev’s dice', yourDice: 'Your dice', cupDown: 'Jev’s dice are hidden under the cup',
    },
    zh: {
      title: '吹牛骰子',
      tagline: '五颗骰子扣在盅里，只问一件事：Jev 叫的点数，是真是假？',
      concept: '诈唬与贝叶斯推断',
      rules: '你和 Jev 各摇 5 颗骰子，只能看自己的。双方轮流叫点：“两边加起来至少有 N 个 F 点”。1 点是万能点，可以当任何点数，所以不能叫 1。每次叫的必须更大：个数更多，或个数相同但点数更大。也可以喊“开！”：叫点成立则开的人输一颗骰子，否则叫的人输一颗。输的人先叫下一轮。骰子输光就输了。',
      you: '你', jev: 'Jev', round: '回合',
      diceLeft: '剩 {n} 颗', dieLeft: '剩 1 颗',
      awaiting: '等待第一口叫点',
      jevOpening: 'Jev 正在开叫',
      bids_jev: 'Jev 叫', bids_you: '你叫',
      history: '本轮叫点',
      youOpen: '这一轮你先叫。',
      yourTurn: '轮到你：继续叫，还是开？',
      jevTurn: 'Jev 正在盘算',
      bidLabel: '{q} 个 {f}',
      bidBtn: '叫 {q} 个',
      liar: '开！',
      qty: '个数',
      face: '点数',
      wild: '1 点万能',
      hint: '只看你自己的骰子：{lk}（{p}）',
      lk_certain: '必定成立', lk_very_likely: '很可能成立', lk_likely: '大概率成立', lk_coin_flip: '五五开',
      lk_unlikely: '不太可能', lk_very_unlikely: '很不可能', lk_impossible: '不可能',
      calls_you: '你开了 Jev 的叫点',
      calls_jev: 'Jev 开了你的叫点',
      revealing: '开盅',
      tallyNeed: '叫的是 {q} 个',
      bidTrue: '叫点成立',
      bidFalse: '叫点不成立',
      youLose: '你输一颗骰子。',
      jevLoses: 'Jev 输一颗骰子。',
      nextRound: '下一轮',
      win: '你赢下了这一局',
      lose: 'Jev 赢下了这一局',
      matchWin: '你赢走了 Jev 的最后一颗骰子。',
      matchLose: 'Jev 赢走了你的最后一颗骰子。',
      newGame: '新开一局',
      q: '继续叫还是开？',
      qOpen: '第一口叫点',
      mvOpen: '开局 · Jev 叫 {bid}', mvRaise: 'Jev 加叫到 {bid}', mvLiar: 'Jev 对 {bid} 喊“开”',
      thinksBluff: '认为你在吹牛',
      caption: '仅供娱乐与学习 · 不涉及金钱',
      jevDice: 'Jev 的骰子', yourDice: '你的骰子', cupDown: 'Jev 的骰子扣在盅里',
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
    const now = () => performance.now();
    // Animations are keyed to the moment their event happened, so a re-render mid-way
    // (e.g. a click on the picker, a language switch) continues them instead of restarting.
    const at = (since, delay = 0, extra) => ({ animationDelay: `${Math.round(delay - (now() - since))}ms`, ...extra });

    let dice, bids, phase, turn, busy, pick, reveal, stats, starter, roundNo, log;
    let bluffCal = []; // this round's Jev 'opp_bluffing' judgements: { res, p, bid } (telemetry)
    let rollAt = 0, bidAt = 0;

    const total = () => dice.you.length + dice.jev.length;
    const current = () => (bids.length ? bids[bids.length - 1] : null);
    // The die a player just lost is still drawn (fading) until the next round starts.
    const lost = (who) => (phase !== 'bidding' && reveal?.shown && reveal.loser === who ? 1 : 0);
    const bidLabel = (b) => L('bidLabel', { q: b.qty, f: b.face });
    // Jev modes: Jev's odds are sealed during a round and reviewed once the dice are revealed;
    // the review stays up until Jev's first decision of the next round.
    let reviewing = false;
    // anonymous telemetry: never allowed to break the game
    const track = (fn, ...a) => { try { ctx.track?.[fn]?.(...a); } catch { /* ignore */ } };
    // How plausible a bid was from the bidder's own dice (the other cup unknown, 1s wild).
    const plaus = (who, bid) => {
      const p = bidProb(dice[who], dice[who === 'you' ? 'jev' : 'you'].length, bid);
      return p >= 0.6 ? 'likely' : p >= 0.35 ? 'even' : 'unlikely';
    };

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
      track('start');
      gen++;
      timers.forEach(clearTimeout);
      timers.clear();
      dice = { you: rollDice(START_DICE), jev: rollDice(START_DICE) };
      stats = { honest: 0, bluff: 0 }; // how truthful the human's bids have been (Jev's view)
      log = []; // finished rounds, for Jev's record of earlier rounds (both modes)
      roundNo = 0;
      reviewing = false;
      panel.clearSealed();
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
      bluffCal = [];
      rollAt = now();
      pick = defaultPick();
      render();
      if (who === 'jev') jevTurn();
    }

    // Earlier rounds from Jev's point of view (sent in both modes).
    const jevView = (by) => (by === 'jev' ? 'jev' : 'opp');
    const pastForJev = () => log.map((r) => ({
      bid: { by: jevView(r.bid.by), qty: r.bid.qty, face: r.bid.face },
      called_by: jevView(r.caller),
      actual: r.actual,
      loser: jevView(r.loser),
      opp_dice: r.youDice,
    }));

    async function jevTurn() {
      const g = gen;
      busy = true;
      turn = 'jev';
      render();
      if (!reviewing) panel.thinking(); // keep last round's review up until Jev actually moves
      await sleep(bids.length ? 450 : 900);
      if (!alive || g !== gen) return;
      const view = bids.map((b) => ({ by: jevView(b.by), qty: b.qty, face: b.face }));
      const cur = current();
      // Hinted payload = the raw record + code-computed likelihoods / style (same options).
      const past = pastForJev();
      const hinted = makePayload(dice.jev, dice.you.length, view, stats, past);
      const raw = makeRawPayload(dice.jev, dice.you.length, view, past);
      const res = await ctx.decide('liarsdice', (mode) => (mode === 'raw' ? raw.payload : hinted.payload), localBot);
      if (!alive || g !== gen) return;
      // The practice bot always answers the hinted payload; Jev answers whichever it was sent.
      const optionMap = res.source === 'jev' && res.mode === 'raw' ? raw.optionMap : hinted.optionMap;
      const legal = Object.keys(optionMap);
      const id = ctx.pickAction(res.answers?.action, legal);
      const opt = optionMap[id];
      const probs = res.answers?.action?.probabilities || {};
      const shown = [...legal].sort((a, b) => (probs[b] || 0) - (probs[a] || 0)).slice(0, PANEL_TOP);
      if (!shown.includes(id)) shown[shown.length - 1] = id;
      shown.sort((a, b) => (probs[b] || 0) - (probs[a] || 0));
      reviewing = false;
      const pBluff = res.answers?.opp_bluffing?.noul;
      if (cur && typeof pBluff === 'number') bluffCal.push({ res, p: pBluff, bid: { qty: cur.qty, face: cur.face } });
      panel.reveal(res, {
        labels: () => Object.fromEntries(shown.map((k) => [k, optionMap[k].type === 'challenge' ? L('liar') : bidLabel(optionMap[k])])),
        picked: id,
        title: () => (opt.type === 'challenge' ? L('mvLiar', { bid: bidLabel(cur) })
          : L(cur ? 'mvRaise' : 'mvOpen', { bid: bidLabel(opt) })),
        extras: () => (cur ? [{ label: L('thinksBluff'), value: res.answers?.opp_bluffing?.noul }] : []),
      });
      if (opt.type === 'challenge') {
        await callLiar('jev', res);
        return;
      }
      track('opp', res, { ph: bids.length ? 'raise' : 'open', act: 'bid', x: plaus('jev', opt) });
      bids.push({ by: 'jev', qty: opt.qty, face: opt.face });
      bidAt = now();
      turn = 'you';
      busy = false;
      pick = defaultPick();
      render();
    }

    function humanBid() {
      if (busy || phase !== 'bidding' || turn !== 'you' || !pick) return;
      if (!isLegalBid(pick, current(), total())) return;
      track('human', { ph: bids.length ? 'raise' : 'open', act: 'bid', x: plaus('you', pick) });
      bids.push({ by: 'you', qty: pick.qty, face: pick.face });
      bidAt = now();
      jevTurn();
    }

    function humanLiar() {
      if (busy || phase !== 'bidding' || turn !== 'you' || !current()) return;
      callLiar('you');
    }

    async function callLiar(challenger, res) {
      const g = gen;
      busy = true;
      const bid = current();
      const all = [...dice.you, ...dice.jev];
      const { count, bidTrue } = resolveChallenge(all, bid);
      const loser = bidTrue ? challenger : bid.by;
      const call = { ph: 'raise', act: 'liar', x: bidTrue ? 'wrong' : 'right' };
      if (challenger === 'jev') track('opp', res, call); else track('human', call);
      // Calibration: each human bid Jev judged — was it actually false (1s wild)?
      for (const c of bluffCal) track('cal', c.res, { ph: 'opp_bluffing', p: c.p, truth: countFace(all, c.bid.face) < c.bid.qty });
      bluffCal = [];
      if (dice[loser].length - 1 <= 0) track('end', loser === 'jev' ? 'win' : 'lose');
      stats = recordBids(stats, bids, 'you', all);
      log.push({ bid: { ...bid }, caller: challenger, actual: count, loser, youDice: [...dice.you] });
      reveal = { bid, challenger, count, bidTrue, loser, shown: false, lostIdx: -1, calledAt: now(), at: 0 };
      phase = 'reveal';
      render();
      await sleep(1100);
      if (!alive || g !== gen) return;
      reveal.shown = true;
      reveal.at = now();
      if (panel.sealed?.length) { panel.unseal(); reviewing = true; }
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
      return h('span.ld-die', { class: `${cls}${face === 1 ? ' ld-one' : ''}`, style, role: 'img', 'aria-label': String(face) },
        Array.from({ length: 9 }, (_, i) => h('i', { class: on.has(i) ? 'p' : '' })));
    }

    // Reveal timings (ms after the cup starts lifting).
    const T_DICE = 280, T_COUNT = 1000, T_STEP = 110;
    function revealOrder() {
      // Order in which matching dice light up: your dice first, then Jev's.
      const order = new Map();
      if (!reveal) return order;
      let k = 0;
      for (const who of ['you', 'jev']) {
        dice[who].forEach((d, i) => { if (d === 1 || d === reveal.bid.face) order.set(`${who}${i}`, k++); });
      }
      return order;
    }
    const tallyAt = (n) => T_COUNT + n * T_STEP + 150;
    const verdictAt = (n) => tallyAt(n) + 350;

    function diceRow(who, order) {
      const arr = dice[who];
      const r = reveal?.shown ? reveal : null;
      const rolling = phase === 'bidding' && who === 'you';
      const since = (ms) => `${Math.round(ms - (now() - (r ? r.at : rollAt)))}ms`;
      return h('div.ld-dice', { role: 'group', 'aria-label': L(who === 'you' ? 'yourDice' : 'jevDice') }, arr.map((d, i) => {
        // slot: resting tilt + roll / spill / loss;  die: highlight at the count
        let slotCls = '';
        let dieCls = '';
        const slot = { '--tilt': `${TILT[(i + roundNo) % 5]}deg` };
        const dstyle = {};
        if (rolling) {
          slotCls = ' ld-roll';
          Object.assign(slot, { '--spin': `${SPIN[i]}deg`, '--drift': `${DRIFT[i]}px`, '--roll-delay': since(i * 70) });
        }
        if (r) {
          const k = order.get(`${who}${i}`);
          dieCls = k == null ? 'ld-dim' : d === 1 ? 'ld-hl ld-hl-wild' : 'ld-hl';
          dstyle['--hl-delay'] = since(T_COUNT + (k ?? 0) * T_STEP);
          if (who === 'jev') {
            slotCls += ' ld-spill';
            slot['--in-delay'] = since(T_DICE + i * 70);
          }
          if (lost(who) && i === reveal.lostIdx) {
            slotCls += ' ld-lost';
            slot['--lost-delay'] = since(verdictAt(order.size) + 250);
          }
        }
        return h('span.ld-slot', { class: slotCls.trim(), style: slot }, die(d, dieCls, dstyle));
      }));
    }

    function miniDice(who) {
      const n = dice[who].length;
      const gone = lost(who);
      return h('span.ld-minis', { 'aria-label': n - gone === 1 ? L('dieLeft') : L('diceLeft', { n: n - gone }) },
        Array.from({ length: START_DICE }, (_, i) => {
          if (i < n - gone) return h('span.ld-mini');
          if (gone && i === n - 1) {
            return h('span.ld-mini.ld-mini-going', { style: at(reveal.at, verdictAt(revealOrder().size) + 250) });
          }
          return h('span.ld-mini.ld-mini-empty');
        }));
    }

    function topBar() {
      const active = (who) => phase === 'bidding' && turn === who;
      const side = (who) => h('div.ld-player', { class: `ld-player-${who}${active(who) ? ' on' : ''}` },
        h('span.ld-name', h('span.ld-turn-dot'), L(who)),
        miniDice(who),
      );
      return h('div.ld-top',
        side('you'),
        h('div.ld-round', h('small', L('round')), h('b', roundNo)),
        side('jev'),
      );
    }

    function jevSeat(order) {
      const lifted = !!reveal?.shown;
      const thinking = phase === 'bidding' && turn === 'jev' && busy;
      const cupStyle = lifted ? at(reveal.at) : phase === 'bidding' && !bids.length ? at(rollAt, 0) : undefined;
      return h('div.ld-seat.ld-seat-jev',
        h('div.ld-stage', { class: lifted ? 'ld-open' : '' },
          lifted ? diceRow('jev', order) : h('span.ld-sr', L('cupDown')),
          h('span.ld-cup-shadow', { class: lifted ? 'ld-lifted' : '', style: lifted ? at(reveal.at) : undefined }),
          h('div.ld-cup', {
            class: lifted ? 'ld-lifted' : phase === 'bidding' && !bids.length ? 'ld-shake' : '',
            style: cupStyle,
            html: cupSvg('ldcj', false),
          }),
          thinking ? h('span.ld-think', h('i'), h('i'), h('i')) : null,
        ),
      );
    }

    function placard() {
      const cur = current();
      if (!cur) {
        const opening = phase === 'bidding' && turn === 'jev';
        return h('div.ld-placard.ld-placard-empty', h('span', opening ? L('jevOpening') : L('awaiting')));
      }
      const called = phase !== 'bidding' && reveal;
      return h('div.ld-placard', { class: `ld-from-${cur.by}`, style: called ? undefined : at(bidAt) },
        h('small.ld-placard-cap', L(`bids_${cur.by}`)),
        h('div.ld-placard-main', h('b.ld-qty', cur.qty), h('span.ld-times', '×'), die(cur.face, 'ld-die-lg')),
        called ? h('span.ld-seal', { style: at(reveal.calledAt) }, L('liar')) : null,
      );
    }

    function tally(order) {
      const r = reveal;
      const all = [...dice.you, ...dice.jev];
      const wilds = all.filter((d) => d === 1).length;
      const faces = all.filter((d) => d === r.bid.face).length;
      return h('div.ld-tally', { class: r.bidTrue ? 'ld-true' : 'ld-false', style: at(r.at, tallyAt(order.size)) },
        die(r.bid.face, 'ld-die-xs'), h('span.ld-tn', faces),
        h('span.ld-op', '+'),
        die(1, 'ld-die-xs'), h('span.ld-tn', wilds),
        h('span.ld-op', '='),
        h('b.ld-tsum', r.count),
        h('span.ld-tneed', L('tallyNeed', { q: r.bid.qty })),
      );
    }

    function timeline() {
      if (bids.length < 2) return null;
      const hidden = Math.max(0, bids.length - TIMELINE_MAX);
      return h('ol.ld-timeline', { 'aria-label': L('history') },
        hidden ? h('li.ld-tl-more', `+${hidden}`) : null,
        bids.slice(hidden).map((b, j) => h('li.ld-tl', { class: `ld-tl-${b.by}${hidden + j === bids.length - 1 ? ' ld-tl-now' : ''}` },
          h('span.ld-tl-who', L(b.by)),
          h('span.ld-tl-bid', b.qty, h('span.ld-tl-x', '×'), die(b.face, 'ld-die-xs')),
        )),
      );
    }

    function youSeat(order) {
      return h('div.ld-seat.ld-seat-you',
        h('div.ld-tray', diceRow('you', order)),
        h('div.ld-cup-aside', { html: cupSvg('ldcy', true) }),
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
        : '';
      return h('div.ld-controls',
        h('p.ld-prompt', { class: myTurn ? '' : 'ld-waiting' }, myTurn ? (cur ? L('yourTurn') : L('youOpen')) : L('jevTurn')),
        h('div.ld-picker', { class: myTurn ? '' : 'ld-disabled' },
          h('div.ld-field',
            h('small.ld-label', L('qty')),
            h('div.ld-stepper',
              h('button.ld-step', { type: 'button', disabled: !myTurn || !pick || !isLegalBid({ qty: q - 1, face: f }, cur, tot), onclick: () => setPick({ qty: q - 1, face: f }), 'aria-label': '−' }, '−'),
              h('b.ld-stepval', { 'aria-live': 'polite' }, pick ? q : '–'),
              h('button.ld-step', { type: 'button', disabled: !myTurn || !pick || q + 1 > tot, onclick: () => setPick({ qty: q + 1, face: f }), 'aria-label': '+' }, '+'),
            ),
          ),
          h('div.ld-field',
            h('small.ld-label', L('face'), h('span.ld-wildnote', ' · ', L('wild'))),
            h('div.ld-faces', FACES.map((face) => {
              const m = minQty(face, cur);
              return h('button.ld-face', {
                type: 'button',
                class: pick && face === f ? 'on' : '',
                'aria-pressed': pick && face === f ? 'true' : 'false',
                disabled: !myTurn || m > tot,
                onclick: () => setPick({ qty: Math.max(q || 1, m), face }),
                'aria-label': String(face),
              }, die(face, 'ld-die-sm'));
            })),
          ),
        ),
        h('p.ld-hint', hint),
        h('div.btn-row',
          h('button.btn.lg.ld-btn-bid', { disabled: !canBid, onclick: humanBid },
            L('bidBtn', { q: pick ? q : '–' }), pick ? die(f, 'ld-die-btn') : null),
          h('button.btn.lg.ld-btn-liar', { disabled: !myTurn || !cur, onclick: humanLiar }, L('liar')),
        ),
      );
    }

    function verdict(order) {
      const r = reveal;
      const head = h('p.ld-callline', r.challenger === 'you' ? L('calls_you') : L('calls_jev'), ' · ', bidLabel(r.bid));
      if (!r.shown) {
        return h('div.ld-controls', head, h('p.ld-prompt.ld-waiting', L('revealing')));
      }
      const good = r.loser === 'jev';
      const over = phase === 'matchover';
      return h('div.ld-controls', head,
        h('div.ld-verdict', { class: good ? 'ld-good' : 'ld-bad', style: at(r.at, verdictAt(order.size)) },
          h('div.ld-verdict-rule'),
          h('div.ld-verdict-title', r.bidTrue ? L('bidTrue') : L('bidFalse')),
          h('div.ld-verdict-sub', good ? L('jevLoses') : L('youLose')),
          over ? h('div.ld-final', h('b', good ? L('win') : L('lose')), h('span', good ? L('matchWin') : L('matchLose'))) : null,
          h('div.btn-row', over
            ? h('button.btn.lg.ld-btn-bid', { onclick: newGame }, L('newGame'))
            : h('button.btn.lg.ld-btn-bid', { onclick: nextRound }, L('nextRound'))),
        ),
      );
    }

    function render() {
      const order = revealOrder();
      board.replaceChildren(
        h('div.ld-root',
          topBar(),
          h('div.ld-mat',
            h('div.ld-felt',
              jevSeat(order),
              h('div.ld-center',
                placard(),
                reveal?.shown ? tally(order) : null,
                timeline(),
              ),
              youSeat(order),
            ),
          ),
          phase === 'bidding' ? picker() : verdict(order),
          h('p.ld-caption', L('caption')),
        ),
      );
    }

    newGame();
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
