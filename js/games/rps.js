// Rock-Paper-Scissors: "Predict the human". Jev judges, code acts:
// Jev only predicts your next throw; code turns the prediction into a counter-strategy
// blended with the Nash equilibrium (1/3 each), leaning on Nash when the read is weak.

import { choiceAnswer, noulAnswer, normalize } from '../engine.js';
import { THROWS, COUNTER, outcomeOf, analyze, applyRel, COND } from '../../shared/games/rps.js';

const TOTAL = 20;
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

// Practice bot (automatic fallback when Jev is unreachable):
// frequency + first-order Markov (after throw X) + habit after win/loss/draw.
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

// ---------- SVG (all markup is code-controlled; translated text is escaped) ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function svg(markup) {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  return tpl.content.firstElementChild;
}
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Hand illustrations, drawn pointing up in a 120×120 box from capsules (one stroke weight
// everywhere thanks to non-scaling strokes; see css/games/rps.css).
const FW = 12.5;
const FX = [34, 47, 60, 73];
const cap = (x, y, w, hh, cls = 'skin', tf = '') => `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${hh}" rx="${Math.min(w, hh) / 2}"${tf ? ` transform="${tf}"` : ''}/>`;
const finger = (i, top, rot = 0) => {
  const tf = rot ? `rotate(${rot} ${FX[i] + FW / 2} 74)` : '';
  return cap(FX[i], top, FW, 80 - top, 'skin', tf) + `<path class="crease" d="M${FX[i] + 3.5} ${top + 20}h${FW - 7}"${tf ? ` transform="${tf}"` : ''}/>`;
};
const curled = (i, top) => cap(FX[i], top, FW, 30) + `<path class="crease" d="M${FX[i] + 3.2} ${top + 13}h${FW - 6.4}"/>`;
const FIT = { rock: 'translate(-11 -21) scale(1.2)', paper: 'translate(2 1) scale(.96)', scissors: 'translate(-2 -2) scale(1.02)' };
const HAND_BODY = {};
for (const kind of THROWS) {
  let s = cap(41, 97, 36, 19, 'cuff') + '<path class="crease" d="M41 103.5h36"/>';
  if (kind === 'paper') s += cap(25, 52, 13, 42, 'skin', 'rotate(-24 33 92)') + '<path class="crease" d="M28.5 72h6" transform="rotate(-24 33 92)"/>';
  if (kind === 'scissors') s += cap(24, 62, 13, 26, 'skin', 'rotate(-12 31 86)');
  s += '<rect class="skin" x="33" y="56" width="52.5" height="46" rx="16"/>';
  if (kind === 'rock') s += curled(0, 47) + curled(1, 45) + curled(2, 46) + curled(3, 49) + cap(26.5, 68, 38, 14) + '<path class="crease" d="M52 71.5v7"/>';
  if (kind === 'paper') s += finger(0, 22) + finger(1, 13) + finger(2, 17) + finger(3, 29);
  if (kind === 'scissors') s += curled(2, 47) + curled(3, 50) + finger(0, 16, -13) + finger(1, 12, 9);
  s += '<path class="crease" d="M45 91c6 3 16 3 23 0"/>';
  HAND_BODY[kind] = `<g transform="${FIT[kind]}">${s}</g>`;
}
const handMarkup = (kind, cls = '') => `<svg viewBox="0 0 120 120" class="rps-svg ${cls}" aria-hidden="true">${HAND_BODY[kind]}</svg>`;
const handSvg = (kind, cls) => svg(handMarkup(kind, cls));

// Ternary (simplex) geometry: rock at the top, paper bottom-left, scissors bottom-right.
const TRI = { rock: [160, 40], paper: [38, 251], scissors: [282, 251] };
const bary = (p) => [0, 1].map((d) => THROWS.reduce((a, x) => a + (p[x] || 0) * TRI[x][d], 0));
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const lerp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
const P = (pt) => `${pt[0].toFixed(1)},${pt[1].toFixed(1)}`;

export default {
  id: 'rps',
  meta: { icon: 'hand', accent: '#ec4899', minutes: 2 },
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
      predicted: 'Jev predicted {x}',
      hit: 'read correctly',
      miss: 'read wrong',
      noRead: 'Jev had no clear read on you yet',
      q: 'Jev thinks you’ll throw…',
      patterned: 'Pattern spotted',
      exploit: 'Exploiting (vs. random)',
      plays: 'Jev plays {x}',
      history: 'History',
      final: 'Round wins {a} : {b} · {d} draws',
      readStat: 'Jev predicted your throw {k} of {n} times. Guessing at random gets about 1 in 3.',
      mixTitle: 'Your mix',
      draws: 'Draws',
      simplex: 'Jev’s read on your next throw',
      nash: 'Nash equilibrium',
      nashSub: '⅓ each',
      now: 'This round',
      before: 'Earlier rounds',
      noPred: 'Jev’s prediction appears here after your first throw',
      hits: 'Jev’s correct reads',
      chance: 'chance',
      you: 'You', jev: 'Jev',
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
      predicted: 'Jev 猜你出{x}',
      hit: '猜中',
      miss: '没猜中',
      noRead: 'Jev 暂时还看不透你',
      q: 'Jev 猜你会出……',
      patterned: '看出规律',
      exploit: '针对性出招（相对随机）',
      plays: 'Jev 出{x}',
      history: '历史',
      final: '回合胜负 {a} : {b} · 平局 {d} 次',
      readStat: 'Jev 猜中了你 {k} / {n} 次。纯靠瞎猜大约是三分之一。',
      mixTitle: '你的出拳分布',
      draws: '平局',
      simplex: 'Jev 对你下一拳的判断',
      nash: '纳什均衡',
      nashSub: '各 ⅓',
      now: '本回合',
      before: '之前的回合',
      noPred: '你出第一拳后，这里会显示 Jev 的预测',
      hits: 'Jev 猜中次数',
      chance: '随机',
      you: '你', jev: 'Jev',
    },
  },

  mount(board, ctx) {
    const { t, h, panel } = ctx;
    let alive = true;
    let history, preds, wins, busy, last, hits, fresh, prevPoint;
    let afterRender = [];

    function reset() {
      history = []; // { human, jev, outcome } — exactly what the schema allows
      preds = []; // Jev's (normalised) prediction for each round, for the simplex plot
      wins = { human: 0, jev: 0, draw: 0 };
      hits = 0;
      busy = false;
      last = null;
      fresh = false;
      prevPoint = null;
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
      const res = await ctx.decide('rps', () => payload, localBot);
      if (!alive) return;
      const patterned = res.answers?.patterned?.noul;
      const { pred, mix, w } = jevStrategy(res.answers?.predict, patterned, history.length);
      const top = THROWS.reduce((a, b) => (pred[b] > pred[a] ? b : a));
      const guess = pred[top] - Math.min(...THROWS.map((x) => pred[x])) >= 0.03 ? top : null; // null: no real read
      const jev = ctx.pickAction(choiceAnswer(mix), THROWS);
      const outcome = outcomeOf(human, jev);
      prevPoint = preds.length ? bary(preds[preds.length - 1]) : bary({ rock: 1 / 3, paper: 1 / 3, scissors: 1 / 3 });
      history.push({ human, jev, outcome });
      preds.push(pred);
      wins[outcome === 'human_won' ? 'human' : outcome === 'jev_won' ? 'jev' : 'draw'] += 1;
      if (guess === human) hits += 1;
      last = { human, jev, outcome, guess };
      const shown = { ...res, answers: { ...res.answers, predict: { ...(res.answers?.predict || {}), probabilities: pred } } };
      panel.show(shown, {
        question: 'predict',
        labels: () => Object.fromEntries(THROWS.map((x) => [x, name(x)])),
        title: () => t('rps.q'),
        extras: () => [
          { label: t('rps.patterned'), value: patterned },
          { label: t('rps.exploit'), value: w },
          ...THROWS.map((x) => ({ label: t('rps.plays', { x: name(x) }), value: mix[x] })),
        ],
      });
      busy = false;
      fresh = true;
      render();
    }

    // ---------- score header ----------
    function header(done) {
      const n = history.length;
      const shown = Math.min(n + (done ? 0 : 1), TOTAL);
      return h('div.rps-head',
        h('div.rps-sc.you', h('small', t('rps.you')), h('b', { class: fresh && last?.outcome === 'human_won' ? 'bump' : '' }, wins.human)),
        h('div.rps-mid',
          h('div.rps-mid-top', h('small', t('round')), h('b', shown), h('span', `/ ${TOTAL}`)),
          h('div.rps-pips', Array.from({ length: TOTAL }, (_, i) => {
            const r = history[i];
            return h('i', { class: r ? (r.outcome === 'human_won' ? 'win' : r.outcome === 'jev_won' ? 'lose' : 'draw') : i === n && !done ? 'now' : '' });
          })),
          h('small.rps-draws', `${t('rps.draws')} ${wins.draw}`),
        ),
        h('div.rps-sc.jev', h('small', t('rps.jev')), h('b', { class: fresh && last?.outcome === 'jev_won' ? 'bump' : '' }, wins.jev)),
      );
    }

    // ---------- arena ----------
    function side(who, kind, state) {
      return h('div.rps-side', { class: `${who} ${state}` },
        h('div.rps-hand', handSvg(kind || 'rock', 'rps-lg')),
        h('b.rps-hname', kind && state !== 'shake' && state !== 'rest' ? name(kind) : ' '),
      );
    }

    function arena() {
      if (!last) {
        return h('div.rps-arena.idle', side('you', null, 'rest'), h('div.rps-vs', h('span.rps-vs-word', 'vs')), side('jev', null, 'rest'));
      }
      if (last.pending) {
        return h('div.rps-arena.shaking', side('you', null, 'shake'), h('div.rps-vs', h('span.rps-shoot', t('rps.shoot'))), side('jev', null, 'shake'));
      }
      const cls = last.outcome === 'human_won' ? 'win' : last.outcome === 'jev_won' ? 'lose' : 'draw';
      const st = (me) => `${fresh ? 'pop' : ''} ${cls === 'draw' ? '' : me ? 'winner' : 'loser'}`;
      return h('div.rps-arena', { class: `${cls} ${fresh ? 'fresh' : ''}` },
        side('you', last.human, st(cls === 'win')),
        h('div.rps-vs',
          h('span.rps-verdict', t(cls === 'win' ? 'rps.winRound' : cls === 'lose' ? 'rps.loseRound' : 'rps.drawRound')),
          last.guess
            ? h('span.rps-guess', { class: last.guess === last.human ? 'hit' : 'miss' },
              handSvg(last.guess, 'rps-sm'), t('rps.predicted', { x: name(last.guess) }),
              h('em', t(last.guess === last.human ? 'rps.hit' : 'rps.miss')))
            : h('span.rps-guess.none', t('rps.noRead')),
        ),
        side('jev', last.jev, st(cls === 'lose')),
      );
    }

    // ---------- ternary plot of Jev's prediction ----------
    function simplex() {
      const A = TRI.rock, B = TRI.paper, C = TRI.scissors;
      const O = bary({ rock: 1 / 3, paper: 1 / 3, scissors: 1 / 3 });
      const n = preds.length;
      const cur = n ? preds[n - 1] : null;
      const top = cur ? THROWS.reduce((a, b) => (cur[b] > cur[a] ? b : a)) : null;
      let g = '';
      // argmax regions (where each throw is Jev's top guess)
      const region = { rock: [A, mid(A, B), O, mid(A, C)], paper: [B, mid(B, C), O, mid(A, B)], scissors: [C, mid(A, C), O, mid(B, C)] };
      for (const x of THROWS) g += `<polygon class="rps-reg ${x === top ? 'on' : ''}" points="${region[x].map(P).join(' ')}"/>`;
      // iso-probability grid at 1/3 and 2/3
      for (const f of [1 / 3, 2 / 3]) {
        g += `<line class="rps-gl" x1="${lerp(A, B, f)[0]}" y1="${lerp(A, B, f)[1]}" x2="${lerp(A, C, f)[0]}" y2="${lerp(A, C, f)[1]}"/>`;
        g += `<line class="rps-gl" x1="${lerp(B, A, f)[0]}" y1="${lerp(B, A, f)[1]}" x2="${lerp(B, C, f)[0]}" y2="${lerp(B, C, f)[1]}"/>`;
        g += `<line class="rps-gl" x1="${lerp(C, A, f)[0]}" y1="${lerp(C, A, f)[1]}" x2="${lerp(C, B, f)[0]}" y2="${lerp(C, B, f)[1]}"/>`;
      }
      for (const [a, b] of [[A, O], [B, O], [C, O]]) g += `<line class="rps-gl axis" x1="${mid(a, b)[0]}" y1="${mid(a, b)[1]}" x2="${O[0]}" y2="${O[1]}"/>`;
      g += `<polygon class="rps-tri" points="${[A, B, C].map(P).join(' ')}"/>`;
      // Nash centre
      g += `<g class="rps-nash"><circle cx="${O[0]}" cy="${O[1]}" r="9"/><path d="M${O[0] - 4} ${O[1]}h8M${O[0]} ${O[1] - 4}v8"/></g>`;
      g += `<text class="rps-nash-t" x="${O[0]}" y="${O[1] + 24}" text-anchor="middle">${esc(t('rps.nash'))}</text><text class="rps-nash-s" x="${O[0]}" y="${O[1] + 36}" text-anchor="middle">${esc(t('rps.nashSub'))}</text>`;
      // corners
      const cornerPos = { rock: [A[0], A[1] - 30], paper: [B[0] - 4, B[1] + 8], scissors: [C[0] + 4, C[1] + 8] };
      for (const x of THROWS) {
        const [cx, cy] = cornerPos[x];
        const pctTxt = cur ? `${Math.round(cur[x] * 100)}%` : '';
        const anchor = x === 'rock' ? 'middle' : x === 'paper' ? 'start' : 'end';
        const ix = x === 'rock' ? cx - 14 : x === 'paper' ? cx - 10 : cx - 18;
        const tx = x === 'rock' ? cx + 20 : x === 'paper' ? cx + 22 : cx - 22;
        g += `<svg x="${ix}" y="${cy - 14}" width="28" height="28" viewBox="0 0 120 120" class="rps-svg rps-cic ${x === top ? 'on' : ''}">${HAND_BODY[x]}</svg>`;
        g += `<text class="rps-corner ${x === top ? 'on' : ''}" x="${tx}" y="${cy + 1}" text-anchor="${x === 'rock' ? 'start' : anchor}" dominant-baseline="middle">${esc(name(x))}${pctTxt ? ` <tspan class="rps-pct">${pctTxt}</tspan>` : ''}</text>`;
      }
      // trail of earlier predictions
      if (n > 1) {
        const pts = preds.slice(0, n - 1).map(bary);
        g += `<polyline class="rps-trail" points="${[...pts, bary(cur)].map(P).join(' ')}"/>`;
        pts.forEach((p, i) => { g += `<circle class="rps-old" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" style="opacity:${(0.18 + 0.6 * ((i + 1) / (n - 1))).toFixed(2)}"/>`; });
      }
      if (cur) {
        const [x, y] = bary(cur);
        g += `<g class="rps-pt" style="transform:translate(${x.toFixed(1)}px,${y.toFixed(1)}px)"><circle class="halo" r="15"/><circle class="dot" r="6.5"/></g>`;
      } else {
        g += `<text class="rps-nopred" x="160" y="300" text-anchor="middle">${esc(t('rps.noPred'))}</text>`;
      }
      const el = svg(`<svg class="rps-simplex" viewBox="0 -4 320 312" role="img" aria-label="${esc(t('rps.simplex'))}">${g}</svg>`);
      // glide the point from the previous read to the new one
      if (cur && fresh && prevPoint && !reduced()) {
        const [x, y] = bary(cur);
        const from = prevPoint;
        // started after the node is in the document (render → afterRender)
        afterRender.push(() => el.querySelector('.rps-pt')?.animate(
          [{ transform: `translate(${from[0]}px,${from[1]}px)` }, { transform: `translate(${x}px,${y}px)` }],
          { duration: 800, easing: 'cubic-bezier(.2,.8,.2,1)', delay: 150, fill: 'backwards' },
        ));
      }
      return h('figure.rps-panel.rps-plot',
        h('figcaption.rps-cap', h('span', t('rps.simplex'))),
        el,
        h('div.rps-key',
          h('span', h('i.k-now'), t('rps.now')),
          h('span', h('i.k-old'), t('rps.before')),
          h('span', h('i.k-nash'), t('rps.nash'))),
      );
    }

    // ---------- stats: Jev's hit rate and your mix ----------
    function stats() {
      const c = { rock: 0, paper: 0, scissors: 0 };
      history.forEach((r) => { c[r.human] += 1; });
      const n = history.length;
      const rate = n ? hits / n : 0;
      return h('div.rps-panel.rps-stats',
        h('div.rps-cap', h('span', t('rps.hits'))),
        h('div.rps-big', h('b', hits), h('span', `/ ${n}`), h('em', n ? `${Math.round(rate * 100)}%` : '—')),
        h('div.rps-hb-track', h('i', { style: { width: `${rate * 100}%` } }), h('b', { style: { left: `${100 / 3}%` } }, h('span', `${t('rps.chance')} ⅓`))),
        h('div.rps-mix',
          h('small.rps-sub', t('rps.mixTitle')),
          THROWS.map((x) => h('div.rps-mixrow',
            handSvg(x, 'rps-sm'),
            h('span.rps-mixname', name(x)),
            h('span.rps-mixbar', h('i', { style: { width: `${n ? (100 * c[x]) / n : 0}%` } }), h('b', { style: { left: `${100 / 3}%` } })),
            h('span.rps-mixn', c[x]),
          ))),
      );
    }

    // ---------- history strip ----------
    function strip() {
      const n = history.length;
      return h('div.rps-panel.rps-hist',
        h('div.rps-cap', h('span', t('rps.history')),
          h('span.rps-rowlab', h('span', h('i.win'), t('rps.winRound')), h('span', h('i.lose'), t('rps.loseRound')), h('span', h('i.draw'), t('rps.drawRound')))),
        h('div.rps-strip', { 'aria-label': t('rps.history') },
          h('div.rps-strip-lab', h('span', t('rps.you')), h('span', t('rps.jev'))),
          h('div.rps-cells', Array.from({ length: TOTAL }, (_, i) => {
            const r = history[i];
            if (!r) return h('div.rps-cell.empty', { class: i === n ? 'next' : '' }, h('span', i + 1));
            const cls = r.outcome === 'human_won' ? 'win' : r.outcome === 'jev_won' ? 'lose' : 'draw';
            return h('div.rps-cell', { class: `${cls} ${fresh && i === n - 1 ? 'pop' : ''}`, title: `${i + 1}: ${name(r.human)} / ${name(r.jev)}` },
              handSvg(r.human, 'rps-sm'), handSvg(r.jev, 'rps-sm jev'));
          })),
        ),
      );
    }

    function render() {
      if (!alive) return;
      const done = history.length >= TOTAL;
      const outcome = wins.human > wins.jev ? t('result.win') : wins.human < wins.jev ? t('result.lose') : t('result.draw');
      board.replaceChildren(...[
        header(done),
        arena(),
        done
          ? h('div.rps-result', { class: wins.human > wins.jev ? 'win' : wins.human < wins.jev ? 'lose' : 'draw' },
            h('h2', outcome),
            h('p.rps-final', t('rps.final', { a: wins.human, b: wins.jev, d: wins.draw })),
            h('p.rps-readstat', t('rps.readStat', { k: hits, n: TOTAL })),
            h('button.btn.lg', { onclick: reset }, t('new.game')))
          : h('div.rps-actions',
            h('p.rps-prompt', t('rps.choose', { n: history.length + 1 })),
            h('div.rps-throws', THROWS.map((x, i) => h('button.rps-throw', {
              type: 'button', disabled: busy, onclick: () => play(x), 'aria-label': name(x),
            }, h('span.rps-throw-art', handSvg(x, 'rps-md')), h('span.rps-throw-label', name(x)), h('kbd', i + 1)))),
          ),
        h('div.rps-grid2', simplex(), stats()),
        strip(),
      ]);
      fresh = false;
      const run = afterRender;
      afterRender = [];
      run.forEach((fn) => fn());
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
