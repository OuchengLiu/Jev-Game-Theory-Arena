// Colonel Blotto. Follows the module contract described in js/games/pd.js.
// Pure rules and the hinted-mode analysis live in ./blotto-core.js (Node-testable);
// this file is UI only.

import { choiceAnswer, noulAnswer } from '../engine.js';
import {
  ALLOC_IDS, ROUNDS, SOLDIERS, FIELD_KEYS, parseAlloc, makePayloads, botWeights, resolve,
  randomAlloc, tendencies,
} from './blotto-core.js';

// Built-in bot: softmax over the shortlist by estimated win rate (see botWeights).
function localBot(payload) {
  const { action, stacks } = botWeights(payload);
  return { action: choiceAnswer(action), opp_stacks: noulAnswer(stacks) };
}

// ---------------- map artwork (inline SVG, drawn in the map's ink colours) ----------------

// Short downslope strokes along the shadowed flank of a peak (vintage hachures).
function hachures(x1, y1, x2, y2, n) {
  let d = '';
  for (let k = 1; k <= n; k++) {
    const t = k / (n + 1);
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    const len = 4 + 9 * (1 - t);
    d += `M${x.toFixed(1)} ${(y + 1.5).toFixed(1)}l${(-len * 0.35).toFixed(1)} ${len.toFixed(1)}`;
  }
  return d;
}

function starFort(cx, cy, ro, ri, pts = 5) {
  const p = [];
  for (let k = 0; k < pts * 2; k++) {
    const a = (Math.PI * k) / pts - Math.PI / 2;
    const r = k % 2 ? ri : ro;
    p.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a) * 0.72).toFixed(1)}`);
  }
  return p.join(' ');
}

const EMBLEMS = {
  ridge: `<svg viewBox="0 0 140 72" aria-hidden="true">
    <path class="bl-e-fill" d="M6 62 L38 22 L54 40 L74 12 L102 50 L113 41 L134 62 Z"/>
    <path class="bl-e-line" d="M6 62 L38 22 L54 40 L74 12 L102 50 L113 41 L134 62"/>
    <path class="bl-e-hatch" d="${hachures(38, 22, 54, 40, 4)}${hachures(74, 12, 102, 50, 7)}${hachures(113, 41, 134, 62, 3)}"/>
    <path class="bl-e-soft" d="M20 66 C44 60 96 60 122 66"/>
    <path class="bl-e-flag" d="M74 12 V2 l9 3 -9 3"/>
  </svg>`,
  ford: `<svg viewBox="0 0 140 72" aria-hidden="true">
    <path class="bl-e-water" d="M58 0 C52 16 66 26 60 40 C55 52 62 62 58 72 L84 72 C88 62 80 52 84 40 C90 26 78 16 82 0 Z"/>
    <path class="bl-e-line" d="M58 0 C52 16 66 26 60 40 C55 52 62 62 58 72 M82 0 C78 16 90 26 84 40 C80 52 88 62 84 72"/>
    <path class="bl-e-ripple" d="M66 14 q3 -2 6 0 M68 56 q3 -2 6 0 M70 24 q2 -1.5 4 0"/>
    <path class="bl-e-road" d="M4 40 C24 36 40 42 56 40 M86 40 C102 38 118 44 136 40"/>
    <g class="bl-e-stone"><ellipse cx="62" cy="40" rx="3.2" ry="2.2"/><ellipse cx="70" cy="41" rx="3.2" ry="2.2"/><ellipse cx="78" cy="40" rx="3.2" ry="2.2"/></g>
    <path class="bl-e-hatch" d="M44 30 l-2 -5 M48 29 l0 -6 M52 30 l2 -5 M92 52 l-2 -5 M96 51 l0 -6 M100 52 l2 -5"/>
  </svg>`,
  fort: `<svg viewBox="0 0 140 72" aria-hidden="true">
    <polygon class="bl-e-ditch" points="${starFort(70, 42, 40, 25)}"/>
    <polygon class="bl-e-fill bl-e-line" points="${starFort(70, 42, 31, 19)}"/>
    <rect class="bl-e-keep" x="62" y="36" width="16" height="12" rx="1"/>
    <path class="bl-e-line" d="M70 36 V14"/>
    <path class="bl-e-flag" d="M70 14 l12 4 -12 4 Z"/>
  </svg>`,
};

const TERRAIN = `<svg class="bl-terrain" viewBox="0 0 300 120" preserveAspectRatio="none" aria-hidden="true">
  <g class="bl-t-grid">
    <path d="M50 0V120M100 0V120M150 0V120M200 0V120M250 0V120M0 30H300M0 60H300M0 90H300"/>
  </g>
  <g class="bl-t-contour">
    <path d="M8 40 C20 18 70 14 90 30 C104 42 96 70 74 80 C50 92 14 84 8 64 Z"/>
    <path d="M20 44 C28 28 64 26 78 36 C88 46 82 64 66 70 C48 78 24 72 20 58 Z"/>
    <path d="M32 48 C38 38 58 36 66 43 C72 50 66 60 56 63 C44 66 34 62 32 54 Z"/>
    <path d="M214 34 C232 16 284 18 294 40 C302 62 284 90 254 92 C226 94 204 76 206 56 Z"/>
    <path d="M226 44 C238 30 276 32 282 46 C288 62 274 80 254 80 C234 80 220 68 222 56 Z"/>
    <path d="M118 104 C130 96 170 96 182 104"/>
    <path d="M112 14 C126 6 168 8 186 16"/>
  </g>
  <path class="bl-t-river" d="M168 -4 C160 20 142 26 150 48 C158 70 140 86 146 124"/>
  <path class="bl-t-bank" d="M168 -4 C160 20 142 26 150 48 C158 70 140 86 146 124"/>
  <path class="bl-t-road" d="M-4 62 C30 56 70 66 100 60 C130 54 170 66 200 60 C230 54 270 64 304 58"/>
</svg>`;

const COMPASS = `<svg class="bl-compass" viewBox="0 0 40 40" aria-hidden="true">
  <circle cx="20" cy="20" r="14" class="bl-c-ring"/>
  <path d="M20 3 L23 20 L20 37 L17 20 Z" class="bl-c-ns"/>
  <path d="M20 3 L23 20 L17 20 Z" class="bl-c-n"/>
  <path d="M3 20 L20 17.5 L37 20 L20 22.5 Z" class="bl-c-ew"/>
</svg>`;

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const sum = (a) => a.reduce((x, y) => x + y, 0);

export default {
  id: 'blotto',
  meta: { icon: '⚔️', accent: '#e11d48', minutes: 4, version: '1.3' },
  strings: {
    en: {
      title: 'Colonel Blotto',
      tagline: 'Ten soldiers, three battlefields, sealed orders. Any plan Jev can read, Jev can beat.',
      concept: 'No pure-strategy equilibrium',
      rules: 'Each round you and Jev secretly split 10 soldiers across the Ridge, the Ford and the Fort. More soldiers takes a field; win more fields to take the round. Seven rounds, most rounds wins. There is no best split: 4-3-3 beats 10-0-0 but loses to 5-5-0, which loses to 6-2-2. Any habit can be countered, so the only safe plan is an unpredictable one.',
      ridge: 'Ridge', ford: 'Ford', fort: 'Fort',
      mapTitle: 'Theatre of operations',
      you: 'You', jev: 'Jev',
      reserve: 'Reserve',
      left: '{n} left to deploy',
      left1: '1 left to deploy',
      ready: 'All 10 deployed',
      deploy: 'Deploy',
      balanced: 'Balanced 4-3-3',
      random: 'Random',
      same: 'Repeat last',
      clear: 'Clear',
      plan: 'Round {n}: split your 10 soldiers',
      thinking: 'Jev is drawing up orders…',
      sealed: 'Sealed orders',
      add: 'Add a soldier to the {f}',
      remove: 'Remove a soldier from the {f}',
      yours: 'Yours', jevs: 'Jev’s', even: 'Held even',
      roundWin: 'You take round {n}',
      roundLose: 'Jev takes round {n}',
      roundDraw: 'Round {n} is drawn',
      tally: 'Fields won: you {a}, Jev {b}',
      next: 'Next round',
      keys: 'Keys: 1 2 3 add a soldier · Shift + 1 2 3 remove · Enter deploys',
      notes: 'What your record gives away',
      log: 'Battle log',
      colRound: 'Rd', colYou: 'You', colJev: 'Jev', colResult: 'Result',
      won: 'Won', lost: 'Lost', drawn: 'Draw',
      matchWin: 'You won the campaign {a}–{b}.',
      matchLose: 'Jev won the campaign {b}–{a}.',
      matchDraw: 'The campaign ends level, {a}–{b}.',
      q: 'Split across Ridge · Ford · Fort',
      expectsStack: 'Expects you to put 5+ on one field',
      t_no_history: 'Nothing yet', t_stacks_one_field: 'Stacks one field', t_spreads_evenly: 'Spreads evenly',
      t_often_leaves_a_field_empty: 'Often leaves a field empty',
      t_empties_ridge: 'Leaves the Ridge empty', t_empties_ford: 'Leaves the Ford empty', t_empties_fort: 'Leaves the Fort empty',
      t_heavy_ridge: 'Heavy on the Ridge', t_heavy_ford: 'Heavy on the Ford', t_heavy_fort: 'Heavy on the Fort',
      t_light_ridge: 'Light on the Ridge', t_light_ford: 'Light on the Ford', t_light_fort: 'Light on the Fort',
      t_repeats_exact_splits: 'Repeats splits', t_keeps_same_shape: 'Reuses the same numbers', t_varies_a_lot: 'Varies a lot',
    },
    zh: {
      title: '布洛托上校',
      tagline: '十名士兵，三处战场，密封的军令。只要被 Jev 看穿，就会被 Jev 击败。',
      concept: '没有纯策略均衡',
      rules: '每回合你和 Jev 各自秘密地把 10 名士兵分配到山脊、渡口、堡垒三处战场。兵多者拿下该战场，拿下战场多者赢得本回合。共 7 回合，赢得回合多者胜。不存在最优分配：4-3-3 能赢 10-0-0，却输给 5-5-0，而 5-5-0 又输给 6-2-2。任何习惯都会被针对，唯一安全的打法是让对手猜不透。',
      ridge: '山脊', ford: '渡口', fort: '堡垒',
      mapTitle: '作战地图',
      you: '你', jev: 'Jev',
      reserve: '预备队',
      left: '还剩 {n} 人待部署',
      left1: '还剩 1 人待部署',
      ready: '10 人已全部部署',
      deploy: '出兵',
      balanced: '均衡 4-3-3',
      random: '随机',
      same: '沿用上回合',
      clear: '清空',
      plan: '第 {n} 回合：分配你的 10 名士兵',
      thinking: 'Jev 正在拟定军令…',
      sealed: '军令未启',
      add: '向{f}增派一人',
      remove: '从{f}撤回一人',
      yours: '归你', jevs: '归 Jev', even: '僵持',
      roundWin: '第 {n} 回合，你赢了',
      roundLose: '第 {n} 回合，Jev 赢了',
      roundDraw: '第 {n} 回合，平局',
      tally: '拿下战场：你 {a} 处，Jev {b} 处',
      next: '下一回合',
      keys: '快捷键：1 2 3 增派 · Shift + 1 2 3 撤回 · 回车出兵',
      notes: '你的打法暴露了什么',
      log: '战报',
      colRound: '回合', colYou: '你', colJev: 'Jev', colResult: '结果',
      won: '胜', lost: '负', drawn: '平',
      matchWin: '你以 {a}–{b} 赢下了这场战役。',
      matchLose: 'Jev 以 {b}–{a} 赢下了这场战役。',
      matchDraw: '战役以 {a}–{b} 战平。',
      q: '山脊 · 渡口 · 堡垒 如何分兵',
      expectsStack: '预计你会在某处投入 5 人以上',
      t_no_history: '暂无', t_stacks_one_field: '爱在一处重兵集结', t_spreads_evenly: '兵力分布均匀',
      t_often_leaves_a_field_empty: '常放空一处战场',
      t_empties_ridge: '常放空山脊', t_empties_ford: '常放空渡口', t_empties_fort: '常放空堡垒',
      t_heavy_ridge: '重兵山脊', t_heavy_ford: '重兵渡口', t_heavy_fort: '重兵堡垒',
      t_light_ridge: '山脊兵少', t_light_ford: '渡口兵少', t_light_fort: '堡垒兵少',
      t_repeats_exact_splits: '会重复旧的分配', t_keeps_same_shape: '总用同一组数字', t_varies_a_lot: '变化多端',
    },
  },

  mount(board, ctx) {
    const { t, h, panel } = ctx;
    const L = (k, v) => t(`blotto.${k}`, v);
    let alive = true;
    let gen = 0;
    const timers = new Set();
    const sleep = (ms) => new Promise((r) => {
      if (ms <= 0) { r(); return; }
      const id = setTimeout(() => { timers.delete(id); r(); }, ms);
      timers.add(id);
    });

    // phase: 'plan' | 'thinking' | 'reveal' | 'done' (round shown, waiting) | 'over'
    let alloc, history, score, phase, reveal, fresh, balancedTurn;

    const placed = () => sum(alloc);
    // anonymous telemetry: never allowed to break the game
    const track = (fn, ...a) => { try { ctx.track?.[fn]?.(...a); } catch { /* ignore */ } };
    const shape = (a) => [...a].sort((x, y) => y - x).join('-');
    const fieldName = (i) => L(FIELD_KEYS[i]);

    function newGame() {
      track('start');
      gen++;
      timers.forEach(clearTimeout);
      timers.clear();
      alloc = [0, 0, 0];
      history = []; // Jev's view: { jev, opp } arrays (opp = human)
      score = { you: 0, jev: 0, draw: 0 };
      phase = 'plan';
      reveal = null;
      fresh = -1;
      balancedTurn = 0;
      panel.waiting();
      render();
    }

    // ---------- planning ----------

    function tokenEl(sel) { return board.querySelector(sel); }

    // Animate a token flying from its old position to its new one (FLIP).
    function fly(fromRect, toEl) {
      if (!fromRect || !toEl || reducedMotion() || !toEl.animate) return;
      const r = toEl.getBoundingClientRect();
      const dx = fromRect.left - r.left;
      const dy = fromRect.top - r.top;
      if (Math.abs(dx) + Math.abs(dy) < 1) return;
      toEl.animate(
        [{ transform: `translate(${dx}px, ${dy}px) scale(1.15)` }, { transform: 'translate(0, 0) scale(1)' }],
        { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' },
      );
    }

    function step(i, d) {
      if (phase !== 'plan') return;
      if (d > 0 && placed() >= SOLDIERS) return;
      if (d < 0 && alloc[i] <= 0) return;
      const from = d > 0
        ? tokenEl(`.bl-reserve .bl-tok.on:nth-child(${SOLDIERS - placed()})`)
        : tokenEl(`.bl-field[data-i="${i}"] .bl-side-you .bl-tok.on:nth-child(${alloc[i]})`);
      const rect = from?.getBoundingClientRect();
      alloc[i] += d;
      render();
      const to = d > 0
        ? tokenEl(`.bl-field[data-i="${i}"] .bl-side-you .bl-tok.on:nth-child(${alloc[i]})`)
        : tokenEl(`.bl-reserve .bl-tok.on:nth-child(${SOLDIERS - placed()})`);
      fly(rect, to);
    }

    function setAlloc(next) {
      if (phase !== 'plan') return;
      alloc = [...next];
      render();
      if (!reducedMotion()) {
        board.querySelectorAll('.bl-side-you .bl-tok.on').forEach((el, k) => {
          el.animate?.([{ transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
            { duration: 320, delay: k * 18, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
        });
      }
    }

    function presetBalanced() {
      const shapes = [[4, 3, 3], [3, 4, 3], [3, 3, 4]];
      const cur = shapes.findIndex((s) => s.join() === alloc.join());
      balancedTurn = cur >= 0 ? (cur + 1) % 3 : 0;
      setAlloc(shapes[balancedTurn]);
    }

    // ---------- a round ----------

    async function deploy() {
      if (phase !== 'plan' || placed() !== SOLDIERS) return;
      const g = gen;
      const you = [...alloc];
      phase = 'thinking';
      render();
      panel.thinking();
      let res, jevId, legal;
      try {
        const { hinted, raw, candidateIds } = makePayloads(history, ROUNDS);
        res = await ctx.decide('blotto', (mode) => (mode === 'raw' ? raw : hinted), localBot);
        if (!alive || g !== gen) return;
        legal = res.source === 'jev' && res.mode === 'raw' ? ALLOC_IDS : candidateIds;
        jevId = ctx.pickAction(res.answers?.action, legal);
      } catch (e) {
        console.error('[blotto]', e);
        if (!alive || g !== gen) return;
        phase = 'plan';
        panel.waiting();
        render();
        return;
      }
      const jev = parseAlloc(jevId);
      const probs = res.answers?.action?.probabilities || {};
      const top = [...legal].sort((a, b) => (probs[b] || 0) - (probs[a] || 0)).slice(0, 8);
      if (!top.includes(jevId)) top[top.length - 1] = jevId;
      panel.show(res, {
        labels: () => Object.fromEntries(top.map((k) => [k, parseAlloc(k).join(' · ')])),
        picked: jevId,
        title: () => L('q'),
        extras: () => [{ label: L('expectsStack'), value: res.answers?.opp_stacks?.noul }],
      });

      const { fields, result } = resolve(you, jev);
      reveal = { you, jev, fields, result, step: 0, round: history.length + 1 };
      const ph = `r${reveal.round}`;
      track('human', { ph, act: shape(you), x: result > 0 ? 'win' : result < 0 ? 'lose' : 'draw' });
      track('opp', res, { ph, act: shape(jev), x: result < 0 ? 'win' : result > 0 ? 'lose' : 'draw' });
      const pStack = res.answers?.opp_stacks?.noul;
      if (typeof pStack === 'number') track('cal', res, { ph: 'opp_stacks', p: pStack, truth: Math.max(...you) >= 5 });
      phase = 'reveal';
      render();
      const quick = reducedMotion();
      for (let k = 0; k < 3; k++) {
        await sleep(quick ? 0 : k === 0 ? 380 : 720);
        if (!alive || g !== gen) return;
        reveal.step = k + 1;
        fresh = k;
        render();
        fresh = -1;
      }
      await sleep(quick ? 0 : 650);
      if (!alive || g !== gen) return;
      history.push({ jev, opp: you });
      if (result > 0) score.you++; else if (result < 0) score.jev++; else score.draw++;
      phase = history.length >= ROUNDS ? 'over' : 'done';
      if (phase === 'over') track('end', score.you > score.jev ? 'win' : score.you < score.jev ? 'lose' : 'draw');
      render();
    }

    function nextRound() {
      if (phase !== 'done') return;
      phase = 'plan';
      reveal = null;
      alloc = [0, 0, 0];
      render();
    }

    // ---------- keyboard ----------

    function onKey(e) {
      if (!alive || !board.isConnected || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
      const m = /^Digit([1-3])$/.exec(e.code) || /^Numpad([1-3])$/.exec(e.code);
      if (m && phase === 'plan') {
        e.preventDefault();
        step(Number(m[1]) - 1, e.shiftKey ? -1 : 1);
        return;
      }
      if (e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'A') {
        if (phase === 'plan' && placed() === SOLDIERS) { e.preventDefault(); deploy(); }
        else if (phase === 'done') { e.preventDefault(); nextRound(); }
      }
    }
    document.addEventListener('keydown', onKey);

    // ---------- rendering ----------

    const tokens = (n, cls, extra = {}) => h('div.bl-tokens', { class: cls },
      Array.from({ length: SOLDIERS }, (_, k) => h('span.bl-tok', {
        class: k < n ? 'on' : '',
        style: extra.stagger && k < n ? { '--d': `${k * 45}ms` } : null,
      })));

    function fieldView(i) {
      const shown = reveal && reveal.step > i;
      const win = shown ? (reveal.fields[i] > 0 ? 'you' : reveal.fields[i] < 0 ? 'jev' : 'tie') : null;
      const youN = reveal ? reveal.you[i] : alloc[i];
      const canPlan = phase === 'plan';
      const isFresh = fresh === i;
      return h('div.bl-field', {
        'data-i': i,
        'data-win': win,
        class: [isFresh ? 'bl-fresh' : '', phase === 'thinking' ? 'bl-waiting' : ''].join(' ').trim() || null,
        role: 'group',
        'aria-label': fieldName(i),
      },
      h('div.bl-side.bl-side-jev',
        shown
          ? h('div.bl-count.bl-count-jev', h('b', reveal.jev[i]))
          : h('div.bl-count.bl-seal', { title: L('sealed'), 'aria-label': L('sealed') }, h('span', '?')),
        tokens(shown ? reveal.jev[i] : 0, 'bl-tokens-jev', { stagger: isFresh }),
      ),
      h('div.bl-site',
        h('div.bl-emblem', { html: EMBLEMS[FIELD_KEYS[i]] }),
        h('div.bl-name', h('span', fieldName(i))),
        win ? h('div.bl-ribbon', { class: `bl-ribbon-${win}` }, win === 'you' ? L('yours') : win === 'jev' ? L('jevs') : L('even')) : null,
      ),
      h('div.bl-side.bl-side-you',
        tokens(youN, 'bl-tokens-you'),
        h('div.bl-stepper', { class: canPlan ? '' : 'bl-locked' },
          h('button.bl-step', {
            type: 'button', 'data-focus': `minus-${i}`, disabled: !canPlan || alloc[i] <= 0,
            'aria-label': L('remove', { f: fieldName(i) }), onclick: () => step(i, -1),
          }, h('span', { 'aria-hidden': 'true' }, '−')),
          h('output.bl-num', { 'aria-live': 'polite' }, youN),
          h('button.bl-step', {
            type: 'button', 'data-focus': `plus-${i}`, disabled: !canPlan || placed() >= SOLDIERS,
            'aria-label': L('add', { f: fieldName(i) }), onclick: () => step(i, 1),
          }, h('span', { 'aria-hidden': 'true' }, '+')),
        ),
      ));
    }

    function mapView() {
      const roundNo = reveal ? reveal.round : Math.min(history.length + 1, ROUNDS);
      return h('div.bl-map', { 'data-phase': phase },
        h('div.bl-terrain-wrap', { html: TERRAIN }),
        h('div.bl-map-head',
          h('span.bl-map-title', L('mapTitle'), h('span.bl-map-round', h('i', ' · '), `${roundNo} / ${ROUNDS}`)),
          h('span.bl-legend',
            h('span.bl-key.bl-key-jev', L('jev')),
            h('span.bl-key.bl-key-you', L('you')),
            h('span.bl-compass-wrap', { html: COMPASS }),
          ),
        ),
        h('div.bl-fields', [0, 1, 2].map(fieldView)),
        phase === 'thinking' ? h('div.bl-thinking', h('span.bl-quill'), L('thinking')) : null,
      );
    }

    function planControls() {
      const left = SOLDIERS - placed();
      const last = history.length ? history[history.length - 1].opp : null;
      return h('div.bl-controls',
        h('div.bl-reserve', { class: left === 0 ? 'bl-empty' : '' },
          h('div.bl-reserve-head',
            h('span.bl-reserve-label', L('reserve')),
            h('span.bl-left', left === 0 ? L('ready') : left === 1 ? L('left1') : L('left', { n: left })),
          ),
          tokens(left, 'bl-tokens-reserve'),
        ),
        h('div.bl-presets',
          h('button.btn.ghost.bl-preset', { type: 'button', 'data-focus': 'balanced', onclick: presetBalanced }, L('balanced')),
          h('button.btn.ghost.bl-preset', { type: 'button', 'data-focus': 'random', onclick: () => setAlloc(randomAlloc()) }, L('random')),
          last ? h('button.btn.ghost.bl-preset', { type: 'button', 'data-focus': 'same', onclick: () => setAlloc(last) }, L('same')) : null,
          h('button.btn.ghost.bl-preset', { type: 'button', 'data-focus': 'clear', disabled: placed() === 0, onclick: () => setAlloc([0, 0, 0]) }, L('clear')),
        ),
        h('button.btn.lg.bl-deploy', { type: 'button', 'data-focus': 'deploy', disabled: left !== 0, onclick: deploy }, L('deploy')),
        h('p.bl-keys.muted', L('keys')),
      );
    }

    function verdictView() {
      const r = reveal;
      const settled = r && (phase === 'done' || phase === 'over');
      if (!settled) return h('div.bl-verdict.bl-pending', { 'aria-hidden': 'true' });
      const a = r.fields.filter((x) => x > 0).length;
      const b = r.fields.filter((x) => x < 0).length;
      const key = r.result > 0 ? 'roundWin' : r.result < 0 ? 'roundLose' : 'roundDraw';
      return h('div.bl-verdict', { class: `bl-v-${r.result > 0 ? 'you' : r.result < 0 ? 'jev' : 'tie'}` },
        h('h3', L(key, { n: r.round })),
        h('p.muted', L('tally', { a, b })),
        phase === 'done' ? h('button.btn.lg', { type: 'button', 'data-focus': 'next', onclick: nextRound }, L('next')) : null,
      );
    }

    function notesView() {
      const opp = history.map((x) => x.opp);
      if (!opp.length) return null;
      const ts = tendencies(opp).filter((k) => k !== 'no_history');
      if (!ts.length) return null;
      return h('div.bl-notes',
        h('small', L('notes')),
        h('div.bl-note-chips', ts.map((k) => h('span.bl-note', L(`t_${k}`)))),
      );
    }

    function splitCells(mine, theirs, cls) {
      return h('span.bl-split', { class: cls }, mine.map((v, k) => h('b', { class: v > theirs[k] ? 'w' : v < theirs[k] ? 'l' : 't' }, v)));
    }

    function logView() {
      if (!history.length) return null;
      return h('div.bl-log',
        h('div.bl-log-head', L('log')),
        h('div.bl-log-scroll',
          h('table',
            h('thead', h('tr',
              h('th', L('colRound')),
              h('th', h('span.bl-th-you', L('colYou')), h('small', FIELD_KEYS.map((f) => L(f)).join(' · '))),
              h('th', h('span.bl-th-jev', L('colJev'))),
              h('th', L('colResult')),
            )),
            h('tbody', history.map((r, k) => {
              const res = resolve(r.opp, r.jev).result;
              return h('tr',
                h('td.bl-rd', k + 1),
                h('td', splitCells(r.opp, r.jev, 'bl-split-you')),
                h('td', splitCells(r.jev, r.opp, 'bl-split-jev')),
                h('td', h('span.bl-res', { class: res > 0 ? 'you' : res < 0 ? 'jev' : 'tie' }, L(res > 0 ? 'won' : res < 0 ? 'lost' : 'drawn'))),
              );
            })),
          ),
        ),
      );
    }

    function pips() {
      return h('div.bl-pips', { 'aria-hidden': 'true' }, Array.from({ length: ROUNDS }, (_, k) => {
        const r = history[k];
        const res = r ? resolve(r.opp, r.jev).result : null;
        const cur = !r && k === history.length && phase !== 'over';
        return h('span.bl-pip', { class: res == null ? (cur ? 'cur' : '') : res > 0 ? 'you' : res < 0 ? 'jev' : 'tie' });
      }));
    }

    function resultView() {
      const { you: a, jev: b } = score;
      const title = a > b ? t('result.win') : a < b ? t('result.lose') : t('result.draw');
      return h('div.result.bl-result', { class: a > b ? 'bl-r-you' : a < b ? 'bl-r-jev' : '' },
        h('h2', title),
        h('p.muted', L(a > b ? 'matchWin' : a < b ? 'matchLose' : 'matchDraw', { a, b })),
        h('button.btn.lg', { type: 'button', 'data-focus': 'new', onclick: newGame }, t('new.game')),
      );
    }

    function render() {
      if (!alive) return;
      const focusKey = board.contains(document.activeElement) ? document.activeElement?.dataset?.focus : null;
      const roundNo = Math.min(history.length + (phase === 'over' ? 0 : 1), ROUNDS);
      board.replaceChildren(h('div.bl-root',
        h('div.scoreboard',
          h('div.sb-side', h('small', t('you')), h('b.bl-sb-you', score.you)),
          h('div.sb-mid', h('small', t('round')), h('b', `${roundNo} / ${ROUNDS}`)),
          h('div.sb-side.right', h('small', t('opp')), h('b.bl-sb-jev', score.jev)),
        ),
        pips(),
        phase === 'plan' ? h('p.prompt.bl-prompt', L('plan', { n: history.length + 1 })) : null,
        mapView(),
        phase === 'plan' ? planControls() : verdictView(),
        phase === 'over' ? resultView() : null,
        notesView(),
        logView(),
      ));
      if (focusKey) {
        const el = board.querySelector(`[data-focus="${focusKey}"]`);
        if (el && !el.disabled) el.focus({ preventScroll: true });
        else board.querySelector('.bl-deploy:not(:disabled), [data-focus="next"], [data-focus="new"]')?.focus({ preventScroll: true });
      }
    }

    newGame();
    return {
      render,
      destroy() {
        alive = false;
        gen++;
        timers.forEach(clearTimeout);
        timers.clear();
        document.removeEventListener('keydown', onKey);
      },
    };
  },
};
