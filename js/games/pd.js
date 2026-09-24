// Iterated Prisoner's Dilemma. Reference implementation of the game-module contract:
//
//   export default {
//     id, meta: { icon, accent, minutes }, strings: { en, zh },   // strings → t(`${id}.key`)
//     mount(board, ctx) -> { render(), destroy() }
//   }
// Required strings: title, tagline, concept, rules.
// ctx: { t, h, panel, decide, pickAction, choiceAnswer, noulAnswer, normalize, toast, settings }
// ctx.decide(gameId, (mode) => payload, practiceBot): the payload is the same for both
// Jev modes here; shared/games/pd.js turns it into a hinted or a raw request.

import { choiceAnswer, noulAnswer } from '../engine.js';

const TOTAL = 10;
const PAYOFF = { CC: [3, 3], CD: [0, 5], DC: [5, 0], DD: [1, 1] }; // [human, jev] keyed by human+jev

// Practice bot (automatic fallback when Jev is unreachable): generous tit-for-tat
// with an end-game defection streak.
export function localBot({ round, total, history }) {
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

// ---------- tiny SVG helpers (all markup is code-controlled; text is escaped) ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function svg(markup) {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  return tpl.content.firstElementChild;
}
const ICON = {
  // two joined links / a broken link — same stroke weight as the avatars
  C: '<svg viewBox="0 0 24 24" aria-hidden="true" class="pd-ico"><path d="M9.5 14.5l5-5"/><path d="M11 6.6l1.6-1.6a4.2 4.2 0 0 1 6 6L17 12.6"/><path d="M13 17.4L11.4 19a4.2 4.2 0 0 1-6-6L7 11.4"/></svg>',
  D: '<svg viewBox="0 0 24 24" aria-hidden="true" class="pd-ico"><path d="M11 6.6l1.6-1.6a4.2 4.2 0 0 1 6 6L17 12.6"/><path d="M13 17.4L11.4 19a4.2 4.2 0 0 1-6-6L7 11.4"/><path d="M15.5 3.5v2M20.5 8.5h-2M8.5 20.5v-2M3.5 15.5h2"/></svg>',
};
const AVATAR = {
  you: '<svg viewBox="0 0 48 48" aria-hidden="true" class="pd-av-svg"><circle cx="24" cy="24" r="23" class="pd-av-bg"/><circle cx="24" cy="19" r="6.5"/><path d="M12.5 37.5c1.9-6.2 6.4-9.5 11.5-9.5s9.6 3.3 11.5 9.5"/></svg>',
  jev: '<svg viewBox="0 0 48 48" aria-hidden="true" class="pd-av-svg"><circle cx="24" cy="24" r="23" class="pd-av-bg"/><path d="M24 11.5l10.8 6.25v12.5L24 36.5l-10.8-6.25v-12.5z"/><circle cx="24" cy="24" r="3.2" class="pd-av-core"/><path d="M24 20.8v-9.3M26.8 25.6l8 4.6M21.2 25.6l-8 4.6"/></svg>',
};
const mark = (m, x, y, r, cls = '') => (m === 'C'
  ? `<circle class="pd-mk c ${cls}" cx="${x}" cy="${y}" r="${r}"/>`
  : `<rect class="pd-mk d ${cls}" x="${x - r * 0.85}" y="${y - r * 0.85}" width="${r * 1.7}" height="${r * 1.7}" rx="${r * 0.35}" transform="rotate(45 ${x} ${y})"/>`);

export default {
  id: 'pd',
  meta: { icon: 'handshake', accent: '#10b981', minutes: 3, version: '1.4' },
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
      matrix: 'Payoff matrix',
      matrixNote: 'Your points bottom-left, Jev’s top-right',
      history: 'Moves',
      q: 'Cooperate or defect?',
      coopHint: '3 each if Jev cooperates too',
      defectHint: '5 if Jev cooperates, 1 if not',
      jevC: 'Jev cooperates', jevD: 'Jev defects',
      youC: 'You cooperate', youD: 'You defect',
      pastC: 'Cooperated', pastD: 'Defected',
      sealed: 'Move sealed',
      deciding: 'Deciding',
      waiting: 'Waiting for you',
      chart: 'Points over the match',
      points: 'points',
      mutual: 'Mutual cooperation',
      mutualD: 'Mutual defection',
      betrayed: 'You were exploited',
      betrayer: 'You exploited Jev',
      times: '{n}×',
      coopRate: 'Cooperation rate: you {a}% · Jev {b}%',
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
      matrix: '收益矩阵',
      matrixNote: '左下为你的得分，右上为 Jev 的得分',
      history: '出招记录',
      q: '合作还是背叛？',
      coopHint: '若 Jev 也合作，各得 3 分',
      defectHint: 'Jev 合作你得 5 分，否则 1 分',
      jevC: 'Jev 合作', jevD: 'Jev 背叛',
      youC: '你合作', youD: '你背叛',
      pastC: '合作了', pastD: '背叛了',
      sealed: '已出招',
      deciding: '思考中',
      waiting: '等你出招',
      chart: '累计得分',
      points: '分',
      mutual: '双方合作',
      mutualD: '双方背叛',
      betrayed: '你被背叛',
      betrayer: '你背叛了 Jev',
      times: '{n} 次',
      coopRate: '合作率：你 {a}% · Jev {b}%',
    },
  },

  mount(board, ctx) {
    const { t, h, panel } = ctx;
    let alive = true;
    let history, score, busy, pending, fresh;
    // anonymous telemetry: never allowed to break the game
    const track = (fn, ...a) => { try { ctx.track?.[fn]?.(...a); } catch { /* ignore */ } };

    function reset() {
      track('start');
      history = []; // { jev, opp } from Jev's perspective (opp = human)
      score = [0, 0];
      busy = false;
      pending = null; // the human's sealed move while Jev decides
      fresh = false; // true for the one render right after a round resolves (plays reveal motion)
      panel.waiting();
      render();
    }

    async function play(mine) {
      if (busy || !alive || history.length >= TOTAL) return;
      busy = true;
      pending = mine;
      render();
      panel.thinking();
      // Jev decides without seeing the human's current move (simultaneous game).
      const payload = { round: history.length + 1, total: TOTAL, history: history.map((x) => ({ ...x })) };
      const res = await ctx.decide('pd', () => payload, localBot);
      if (!alive) return;
      const jevAct = ctx.pickAction(res.answers?.action, ['cooperate', 'defect']);
      const jev = jevAct === 'cooperate' ? 'C' : 'D';
      const [a, b] = PAYOFF[mine + jev];
      score = [score[0] + a, score[1] + b];
      const prev = history[history.length - 1]; // previous round (undefined in round 1)
      history.push({ jev, opp: mine });
      const ph = `r${history.length}`;
      track('human', { ph, act: mine, x: prev ? `after_${prev.jev}` : undefined }, res);
      track('opp', res, { ph, act: jev, x: prev ? `after_${prev.opp}` : undefined });
      const pCoop = res.answers?.opp_will_cooperate?.noul;
      if (typeof pCoop === 'number') track('cal', res, { ph: 'opp_will_cooperate', p: pCoop, truth: mine === 'C' });
      if (history.length >= TOTAL) track('end', score[0] > score[1] ? 'win' : score[0] < score[1] ? 'lose' : 'draw');
      panel.show(res, {
        labels: () => ({ cooperate: t('pd.cooperate'), defect: t('pd.defect') }),
        picked: jevAct,
        title: () => t('pd.q'),
        extras: () => [{ label: t('pd.oppWill'), value: res.answers?.opp_will_cooperate?.noul }],
      });
      busy = false;
      pending = null;
      fresh = true;
      render();
    }

    const lastRound = () => history[history.length - 1] || null;

    // ---------- player cards ----------
    function card(side) {
      const you = side === 'you';
      const r = lastRound();
      const move = r ? (you ? r.opp : r.jev) : null;
      const gain = r ? PAYOFF[r.opp + r.jev][you ? 0 : 1] : 0;
      let status;
      if (busy) {
        status = you
          ? h('span.pd-status.sealed', h('i.pd-lock'), t('pd.sealed'))
          : h('span.pd-status.thinking', t('pd.deciding'), h('i.pd-dots', h('i'), h('i'), h('i')));
      } else if (move) {
        status = h('span.pd-status', { class: move === 'C' ? 'c' : 'd' },
          h('span', { html: ICON[move] }), t(move === 'C' ? 'pd.pastC' : 'pd.pastD'), h('b', `+${gain}`));
      } else status = h('span.pd-status.idle', you ? t('pd.waiting') : '—');
      return h('div.pd-card', { class: `${side} ${busy && !you ? 'busy' : ''} ${fresh ? 'fresh' : ''}` },
        h('div.pd-av', { html: AVATAR[side] }),
        h('div.pd-card-body',
          h('small.pd-name', you ? t('you') : t('opp')),
          h('b.pd-score', score[you ? 0 : 1]),
          status,
        ),
      );
    }

    function roundDial(done) {
      const n = history.length;
      const shown = Math.min(n + (done ? 0 : 1), TOTAL);
      const R = 21;
      const C = 2 * Math.PI * R;
      const frac = n / TOTAL;
      return h('div.pd-dial', { 'aria-label': `${t('round')} ${shown} / ${TOTAL}` },
        svg(`<svg viewBox="0 0 50 50" aria-hidden="true"><circle class="pd-dial-track" cx="25" cy="25" r="${R}"/><circle class="pd-dial-fill" cx="25" cy="25" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}" transform="rotate(-90 25 25)"/></svg>`),
        h('div.pd-dial-txt', h('small', t('round')), h('b', shown), h('span', `/ ${TOTAL}`)),
      );
    }

    // ---------- payoff matrix ----------
    function matrix() {
      const r = lastRound();
      const hot = r ? r.opp + r.jev : '';
      const counts = { CC: 0, CD: 0, DC: 0, DD: 0 };
      history.forEach((x) => { counts[x.opp + x.jev] += 1; });
      const cell = (k) => h('div.pd-cell', {
        class: `${k === hot ? 'hot' : ''} ${k === hot && fresh ? 'fresh' : ''} k-${k}`,
        role: 'cell',
        'aria-label': `${t(k[0] === 'C' ? 'pd.youC' : 'pd.youD')}, ${t(k[1] === 'C' ? 'pd.jevC' : 'pd.jevD')}: ${PAYOFF[k][0]} / ${PAYOFF[k][1]}`,
      },
      h('span.pd-pay.you', PAYOFF[k][0]),
      h('span.pd-pay.jev', PAYOFF[k][1]),
      counts[k] ? h('span.pd-count', t('pd.times', { n: counts[k] })) : null);
      const head = (m, who) => h('div.pd-mh', { class: `${who} ${m === 'C' ? 'c' : 'd'}` },
        h('span', { html: ICON[m] }), t(who === 'jev' ? (m === 'C' ? 'pd.jevC' : 'pd.jevD') : (m === 'C' ? 'pd.youC' : 'pd.youD')));
      return h('figure.pd-panel.pd-matrix-wrap',
        h('figcaption.pd-cap', h('span', t('pd.matrix')), h('small', t('pd.matrixNote'))),
        h('div.pd-matrix', { role: 'table' },
          h('div.pd-corner', h('span.you', t('you')), h('span.jev', t('opp'))),
          head('C', 'jev'), head('D', 'jev'),
          head('C', 'you'), cell('CC'), cell('CD'),
          head('D', 'you'), cell('DC'), cell('DD'),
        ),
      );
    }

    // ---------- cumulative score chart ----------
    function chart() {
      const W = 340, H = 236, L = 30, Rp = 38, T = 14, B = 26;
      const cum = [[0, 0]];
      history.forEach((x) => {
        const [a, b] = PAYOFF[x.opp + x.jev];
        const p = cum[cum.length - 1];
        cum.push([p[0] + a, p[1] + b]);
      });
      const top = Math.max(15, ...cum.map((c) => Math.max(c[0], c[1])));
      const yMax = Math.ceil(top / 10) * 10;
      const X = (i) => L + (i / TOTAL) * (W - L - Rp);
      const Y = (v) => T + (1 - v / yMax) * (H - T - B);
      let g = '';
      for (let v = 0; v <= yMax; v += 10) {
        g += `<line class="pd-grid" x1="${L}" x2="${W - Rp}" y1="${Y(v)}" y2="${Y(v)}"/><text class="pd-ax" x="${L - 8}" y="${Y(v) + 3}" text-anchor="end">${v}</text>`;
      }
      for (let i = 1; i <= TOTAL; i++) {
        g += `<text class="pd-ax ${i === history.length ? 'now' : ''}" x="${X(i)}" y="${H - 8}" text-anchor="middle">${i}</text>`;
      }
      const n = history.length;
      const line = (s, cls) => {
        if (!n) return '';
        const pts = cum.map((c, i) => `${X(i).toFixed(1)},${Y(c[s]).toFixed(1)}`);
        const oldPts = pts.slice(0, fresh ? n : n + 1);
        let out = oldPts.length > 1 ? `<polyline class="pd-line ${cls}" points="${oldPts.join(' ')}"/>` : '';
        if (fresh) out += `<polyline class="pd-line ${cls} grow" pathLength="1" points="${pts[n - 1]} ${pts[n]}"/>`;
        return out;
      };
      const dots = (s, cls) => history.map((x, i) => mark(s === 0 ? x.opp : x.jev, X(i + 1), Y(cum[i + 1][s]), 3.6, `${cls} ${fresh && i === n - 1 ? 'pop' : ''}`)).join('');
      // end labels, nudged apart when the lines finish close together
      let labels = '';
      if (n) {
        let yy = Y(cum[n][0]);
        let yj = Y(cum[n][1]);
        if (Math.abs(yy - yj) < 13) {
          const mid = (yy + yj) / 2;
          const youAbove = cum[n][0] >= cum[n][1];
          yy = mid + (youAbove ? -7 : 7);
          yj = mid + (youAbove ? 7 : -7);
        }
        labels = `<text class="pd-end you" x="${X(n) + 8}" y="${yy + 4}">${cum[n][0]}</text><text class="pd-end jev" x="${X(n) + 8}" y="${yj + 4}">${cum[n][1]}</text>`;
      }
      const empty = n ? '' : `<text class="pd-ax pd-empty" x="${(L + W - Rp) / 2}" y="${H / 2}" text-anchor="middle">${esc(t('pd.waiting'))}</text>`;
      return h('figure.pd-panel.pd-chart-wrap',
        h('figcaption.pd-cap', h('span', t('pd.chart')),
          h('span.pd-legend', h('span.you', h('i'), t('you')), h('span.jev', h('i'), t('opp')),
            h('span.mk', svg(`<svg viewBox="0 0 12 12" aria-hidden="true">${mark('C', 6, 6, 3.6)}</svg>`), t('pd.cooperate')),
            h('span.mk', svg(`<svg viewBox="0 0 12 12" aria-hidden="true">${mark('D', 6, 6, 3.6)}</svg>`), t('pd.defect')))),
        svg(`<svg class="pd-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('pd.chart'))}">${g}${empty}${line(0, 'you')}${line(1, 'jev')}${dots(0, 'you')}${dots(1, 'jev')}${labels}</svg>`),
      );
    }

    // ---------- move timeline ----------
    function timeline() {
      const n = history.length;
      const tok = (m, i) => h('span.pd-tok', { class: `${m ? (m === 'C' ? 'c' : 'd') : i === n ? 'next' : 'empty'} ${fresh && i === n - 1 ? 'pop' : ''}`, title: m ? t(m === 'C' ? 'pd.cooperate' : 'pd.defect') : '' });
      const row = (label, key) => [h('span.pd-tl-lab', label), ...Array.from({ length: TOTAL }, (_, i) => tok(history[i]?.[key], i))];
      return h('div.pd-panel.pd-tl-wrap',
        h('div.pd-cap', h('span', t('pd.history'))),
        h('div.pd-tl', { style: { '--n': TOTAL } },
          h('span'), ...Array.from({ length: TOTAL }, (_, i) => h('span.pd-tl-n', { class: i === n - 1 ? 'now' : '' }, i + 1)),
          ...row(t('you'), 'opp'),
          ...row(t('opp'), 'jev'),
          h('span.pd-tl-lab.pts', t('pd.points')),
          ...Array.from({ length: TOTAL }, (_, i) => {
            const r = history[i];
            return h('span.pd-tl-pts', r ? `${PAYOFF[r.opp + r.jev][0]}·${PAYOFF[r.opp + r.jev][1]}` : '');
          }),
        ),
      );
    }

    function moveButton(m) {
      const c = m === 'C';
      return h('button.pd-move', {
        type: 'button', class: c ? 'c' : 'd', disabled: busy, onclick: () => play(m),
      },
      h('span.pd-move-ico', { html: ICON[m] }),
      h('span.pd-move-txt', h('b', t(c ? 'pd.cooperate' : 'pd.defect')), h('small', t(c ? 'pd.coopHint' : 'pd.defectHint'))),
      h('kbd', c ? 'C' : 'D'));
    }

    function render() {
      if (!alive) return;
      const done = history.length >= TOTAL;
      const outcome = score[0] > score[1] ? t('result.win') : score[0] < score[1] ? t('result.lose') : t('result.draw');
      const cnt = { CC: 0, CD: 0, DC: 0, DD: 0 };
      history.forEach((x) => { cnt[x.opp + x.jev] += 1; });
      const pct = (k) => Math.round((100 * history.filter((x) => x[k] === 'C').length) / Math.max(1, history.length));
      const stat = (label, n, cls) => h('div.pd-stat', { class: cls }, h('b', n), h('small', label));
      board.replaceChildren(...[
        h('div.pd-duel', card('you'), roundDial(done), card('jev')),
        done
          ? h('div.pd-result', { class: score[0] > score[1] ? 'win' : score[0] < score[1] ? 'lose' : 'draw' },
            h('h2', outcome),
            h('p.pd-final', t('pd.final', { a: score[0], b: score[1] })),
            h('div.pd-stats',
              stat(t('pd.mutual'), cnt.CC, 'c'),
              stat(t('pd.betrayer'), cnt.DC, ''),
              stat(t('pd.betrayed'), cnt.CD, ''),
              stat(t('pd.mutualD'), cnt.DD, 'd')),
            h('p.muted.pd-rate', t('pd.coopRate', { a: pct('opp'), b: pct('jev') })),
            h('button.btn.lg', { onclick: reset }, t('new.game')))
          : h('div.pd-actions',
            h('p.pd-prompt', t('pd.choose', { n: history.length + 1 })),
            h('div.pd-moves', moveButton('C'), moveButton('D'))),
        h('div.pd-grid2', matrix(), chart()),
        timeline(),
      ]);
      fresh = false;
    }

    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || document.querySelector('dialog[open]')) return;
      const k = e.key?.toLowerCase();
      if (k === 'c') play('C');
      else if (k === 'd') play('D');
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
