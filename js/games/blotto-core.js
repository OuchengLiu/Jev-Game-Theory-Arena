// Colonel Blotto — pure game logic and the code-side analysis for hinted mode.
// No DOM, no engine imports: testable from Node. Used by js/games/blotto.js.
//
// History entries are always kept from Jev's view: { jev: [r, f, t], opp: [r, f, t] }
// where opp is the human.

import {
  ALLOCS, ALLOC_IDS, SOLDIERS, ROUNDS, allocId, parseAlloc, fieldResults, roundResult,
  MAX_CANDIDATES,
} from '../../shared/games/blotto.js';

export { ALLOCS, ALLOC_IDS, SOLDIERS, ROUNDS, allocId, parseAlloc, fieldResults, roundResult };
export const FIELD_KEYS = ['ridge', 'ford', 'fort'];

const N = ALLOCS.length; // 66
const shapeOf = (x) => [...x].sort((a, b) => b - a).join('-');
const SHAPES = ALLOCS.map(shapeOf);
const IDX = Object.fromEntries(ALLOC_IDS.map((id, i) => [id, i]));
export const indexOf = (x) => IDX[allocId(x)];

// OUTCOME[i][j]: result of allocation i against j (1 / 0 / -1).
const OUTCOME = ALLOCS.map((a) => ALLOCS.map((b) => roundResult(a, b)));

// A sensible prior for how people split 10 soldiers: mostly balanced-ish (4-3-3, 5-3-2,
// 4-4-2...), heavy stacks are rarer, an all-in 10-0-0 shows up now and then.
const MAX_WEIGHT = [0, 0, 0, 0, 1, 0.85, 0.5, 0.25, 0.1, 0.05, 0.08];
export const PRIOR = (() => {
  const w = ALLOCS.map((x) => MAX_WEIGHT[Math.max(...x)] * (x.includes(0) && Math.max(...x) < 10 ? 0.7 : 1));
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((v) => v / s);
})();

const PRIOR_STRENGTH = 2.5; // pseudo-rounds of prior
const EXACT_SHARE = 0.65;   // rest of each observation spreads over its rearrangements

/** Distribution over the 66 splits for the opponent's next move, from their past splits. */
export function opponentModel(oppSplits) {
  const n = oppSplits.length;
  const w = PRIOR.map((p) => p * PRIOR_STRENGTH);
  oppSplits.forEach((x, k) => {
    const r = 0.6 + 0.8 * ((k + 1) / n); // recent rounds count a little more
    const i = indexOf(x);
    w[i] += r * EXACT_SHARE;
    const perms = [];
    for (let j = 0; j < N; j++) if (SHAPES[j] === SHAPES[i]) perms.push(j);
    for (const j of perms) w[j] += (r * (1 - EXACT_SHARE)) / perms.length;
  });
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((v) => v / s);
}

/** Expected score (win = 1, draw = 0.5) of each of the 66 splits against a model. */
export function evaluate(model) {
  return OUTCOME.map((row) => {
    let s = 0;
    for (let j = 0; j < N; j++) s += model[j] * (row[j] === 1 ? 1 : row[j] === 0 ? 0.5 : 0);
    return s;
  });
}

export function outlook(score) {
  return score >= 0.72 ? 'very_strong'
    : score >= 0.6 ? 'strong'
    : score >= 0.53 ? 'slight_edge'
    : score >= 0.47 ? 'even'
    : score >= 0.35 ? 'weak'
    : 'very_weak';
}

export const basisOf = (n) => (n === 0 ? 'typical_players' : n < 3 ? 'few_rounds' : 'their_past_splits');

/** Tendency words (TENDENCIES enum) describing the human's past splits. At most 6. */
export function tendencies(oppSplits) {
  const n = oppSplits.length;
  if (!n) return ['no_history'];
  const out = [];
  const frac = (f) => oppSplits.filter(f).length / n;
  if (frac((x) => Math.max(...x) >= 6) >= 0.5) out.push('stacks_one_field');
  else if (frac((x) => Math.max(...x) <= 4) >= 0.6) out.push('spreads_evenly');
  const empties = FIELD_KEYS.filter((_, i) => n >= 2 && frac((x) => x[i] === 0) >= 0.4);
  if (empties.length) empties.forEach((f) => out.push(`empties_${f}`));
  else if (frac((x) => x.includes(0)) >= 0.5) out.push('often_leaves_a_field_empty');
  FIELD_KEYS.forEach((f, i) => {
    const avg = oppSplits.reduce((a, x) => a + x[i], 0) / n;
    if (avg >= 4.6) out.push(`heavy_${f}`);
    else if (avg <= 2 && !empties.includes(f)) out.push(`light_${f}`);
  });
  if (n >= 2) {
    const ids = oppSplits.map(allocId);
    const shapes = oppSplits.map(shapeOf);
    const repeats = ids.some((id, k) => ids.indexOf(id) < k);
    const shapeRepeats = shapes.filter((s, k) => shapes.indexOf(s) < k).length;
    if (repeats) out.push('repeats_exact_splits');
    else if (shapeRepeats >= Math.max(1, Math.floor((n - 1) / 2))) out.push('keeps_same_shape');
    else if (n >= 3 && shapeRepeats === 0) out.push('varies_a_lot');
  }
  return out.slice(0, 6);
}

/** Up to 16 candidates: the 10 best by estimate plus the best split of other shapes. */
export function shortlist(scores) {
  const order = scores.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  const pick = order.slice(0, 10);
  const seen = new Set(pick.map((i) => SHAPES[i]));
  for (const i of order) {
    if (pick.length >= MAX_CANDIDATES) break;
    if (!seen.has(SHAPES[i])) { seen.add(SHAPES[i]); pick.push(i); }
  }
  return pick.sort((a, b) => a - b); // neutral (id) order, so list position says nothing
}

export const oppSplitsOf = (history) => history.map((r) => r.opp);

/** Everything the UI sends to Jev for one round. history: [{jev, opp}] as arrays. */
export function makePayloads(history, total = ROUNDS) {
  const opp = oppSplitsOf(history);
  const model = opponentModel(opp);
  const scores = evaluate(model);
  const picks = shortlist(scores);
  const wire = history.map((r) => ({ jev: allocId(r.jev), opp: allocId(r.opp) }));
  const round = history.length + 1;
  const hinted = {
    round, total,
    history: wire,
    basis: basisOf(opp.length),
    tendencies: tendencies(opp),
    candidates: picks.map((i) => ({ id: ALLOC_IDS[i], outlook: outlook(scores[i]) })),
  };
  const raw = { round, total, history: wire.map((r) => ({ ...r })) };
  return { hinted, raw, candidateIds: picks.map((i) => ALLOC_IDS[i]), scores, model };
}

/** Practice bot: softmax over the shortlist by estimated score, plus a stacking guess. */
export function botWeights(payload, temperature = 0.07) {
  const opp = payload.history.map((r) => parseAlloc(r.opp));
  const scores = evaluate(opponentModel(opp));
  const ids = payload.candidates.map((c) => c.id);
  const sc = ids.map((id) => scores[IDX[id]]);
  const best = Math.max(...sc);
  const action = Object.fromEntries(ids.map((id, k) => [id, Math.exp((sc[k] - best) / temperature)]));
  const priorStack = PRIOR.reduce((a, p, i) => a + (Math.max(...ALLOCS[i]) >= 5 ? p : 0), 0);
  const stacked = opp.filter((x) => Math.max(...x) >= 5).length;
  const stacks = (stacked + 1.5 * priorStack) / (opp.length + 1.5);
  return { action, stacks };
}

/** Round summary from the human's view. */
export function resolve(you, jev) {
  const fields = fieldResults(you, jev); // 1 = human won the field
  return { fields, result: Math.sign(fields.reduce((a, b) => a + b, 0)) };
}

export function randomAlloc(rng = Math.random) {
  return [...ALLOCS[Math.floor(rng() * N)]];
}

