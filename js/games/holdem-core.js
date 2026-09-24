// Heads-up No-Limit Hold'em: pure game logic (no DOM, no browser globals).
// Imported by js/games/holdem.js and unit-testable from Node.
//
// Cards are ints 0..51 with index = rank * 4 + suit, matching CARDS in shared/schema.js
// (rank 0 = '2' … 12 = 'A'; suit order s, h, d, c).
// Players are 0 and 1. hand.stacks are chips behind; hand.total are chips put in this hand.

import { CARDS } from '../../shared/schema.js';

export const START_STACK = 200;
export const SB = 1;
export const BB = 2;
export const STREETS = ['preflop', 'flop', 'turn', 'river'];
export const CATS = ['high_card', 'pair', 'two_pair', 'trips', 'straight', 'flush', 'full_house', 'quads', 'straight_flush'];

export const rankOf = (c) => c >> 2;
export const suitOf = (c) => c & 3;
export const cardStr = (c) => CARDS[c];

// ---------------- hand evaluator ----------------

// Highest straight in a 13-bit rank mask (bit i = rank i). Returns top rank index or -1.
// The wheel A-2-3-4-5 returns 3 (the Five).
function straightHigh(mask) {
  const m = (mask << 1) | ((mask >> 12) & 1); // bit0 = ace-low
  for (let hi = 13; hi >= 4; hi--) if (((m >> (hi - 4)) & 31) === 31) return hi - 1;
  return -1;
}

function topBits(mask, n, out) {
  for (let r = 12; r >= 0 && out.length < n; r--) if (mask & (1 << r)) out.push(r);
  return out;
}

function pack(cat, ks) {
  let s = cat;
  for (let i = 0; i < 5; i++) s = s * 16 + (ks[i] ?? -1) + 1;
  return s;
}

/** Score any 1..7 cards; higher is better. Category = Math.floor(score / 16**5). */
export function evaluate(cards) {
  const cnt = new Array(13).fill(0);
  const sMask = [0, 0, 0, 0];
  const sCnt = [0, 0, 0, 0];
  let mask = 0;
  for (const c of cards) {
    const r = c >> 2, s = c & 3;
    cnt[r]++; sCnt[s]++; sMask[s] |= 1 << r; mask |= 1 << r;
  }
  let fs = -1;
  for (let s = 0; s < 4; s++) if (sCnt[s] >= 5) fs = s;
  if (fs >= 0) {
    const sh = straightHigh(sMask[fs]);
    if (sh >= 0) return pack(8, [sh]);
  }
  const quads = [], trips = [], pairs = [];
  for (let r = 12; r >= 0; r--) {
    if (cnt[r] === 4) quads.push(r);
    else if (cnt[r] === 3) trips.push(r);
    else if (cnt[r] === 2) pairs.push(r);
  }
  if (quads.length) return pack(7, [quads[0], ...topBits(mask & ~(1 << quads[0]), 1, [])]);
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const pr = trips.length > 1 ? Math.max(trips[1], pairs[0] ?? -1) : pairs[0];
    return pack(6, [trips[0], pr]);
  }
  if (fs >= 0) return pack(5, topBits(sMask[fs], 5, []));
  const st = straightHigh(mask);
  if (st >= 0) return pack(4, [st]);
  if (trips.length) return pack(3, [trips[0], ...topBits(mask & ~(1 << trips[0]), 2, [])]);
  if (pairs.length >= 2) {
    const rest = mask & ~(1 << pairs[0]) & ~(1 << pairs[1]);
    return pack(2, [pairs[0], pairs[1], ...topBits(rest, 1, [])]);
  }
  if (pairs.length) return pack(1, [pairs[0], ...topBits(mask & ~(1 << pairs[0]), 3, [])]);
  return pack(0, topBits(mask, 5, []));
}

export const category = (score) => Math.floor(score / 1048576); // 16**5

/** Name key for a score: one of CATS, plus 'royal_flush'. */
export function handName(score) {
  const cat = category(score);
  if (cat === 8 && Math.floor(score / 65536) % 16 === 13) return 'royal_flush';
  return CATS[cat];
}

/** The five cards (subset of `cards`) that make the best hand, e.g. to highlight at showdown. */
export function bestFive(cards) {
  if (cards.length <= 5) return [...cards];
  const target = evaluate(cards);
  const n = cards.length;
  const pick = [];
  const rec = (start) => {
    if (pick.length === 5) return evaluate(pick) === target ? [...pick] : null;
    for (let i = start; i <= n - (5 - pick.length); i++) {
      pick.push(cards[i]);
      const r = rec(i + 1);
      pick.pop();
      if (r) return r;
    }
    return null;
  };
  return rec(0) || cards.slice(0, 5);
}

// ---------------- equity (Monte-Carlo vs a random hand) ----------------

export function equity(hole, board, samples = 600, rng = Math.random) {
  const used = new Set([...hole, ...board]);
  const rest = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) rest.push(c);
  const need = 2 + (5 - board.length);
  let win = 0;
  const mine = [...hole, ...board];
  for (let i = 0; i < samples; i++) {
    // partial Fisher-Yates over a copy-free index shuffle
    for (let k = 0; k < need; k++) {
      const j = k + Math.floor(rng() * (rest.length - k));
      const tmp = rest[k]; rest[k] = rest[j]; rest[j] = tmp;
    }
    const extra = rest.slice(2, need);
    const a = evaluate([...mine, ...extra]);
    const b = evaluate([rest[0], rest[1], ...board, ...extra]);
    win += a > b ? 1 : a === b ? 0.5 : 0;
  }
  return win / samples;
}

// ---------------- semantic descriptors (for Jev) ----------------

export const EQUITY_BUCKETS = ['very_weak', 'weak', 'marginal', 'decent', 'strong', 'very_strong', 'monster'];
export function equityBucket(e) {
  return e < 0.3 ? 'very_weak' : e < 0.42 ? 'weak' : e < 0.5 ? 'marginal' : e < 0.58 ? 'decent'
    : e < 0.7 ? 'strong' : e < 0.85 ? 'very_strong' : 'monster';
}

export const PREFLOP_KINDS = ['pocket_pair_high', 'pocket_pair_mid', 'pocket_pair_low', 'two_broadway', 'ace_suited',
  'ace_offsuit', 'suited_connector', 'suited', 'connector', 'weak'];
export const POSTFLOP_KINDS = ['high_card', 'board_plays', 'pair_low', 'pair_middle', 'top_pair_weak_kicker',
  'top_pair_good_kicker', 'overpair', 'two_pair', 'set', 'trips', 'straight', 'flush', 'full_house', 'quads', 'straight_flush'];
export const HAND_KINDS = [...PREFLOP_KINDS, ...POSTFLOP_KINDS];

export function preflopKind([a, b]) {
  const hi = Math.max(rankOf(a), rankOf(b)), lo = Math.min(rankOf(a), rankOf(b));
  const suited = suitOf(a) === suitOf(b);
  const gap = hi - lo;
  if (gap === 0) return hi >= 8 ? 'pocket_pair_high' : hi >= 4 ? 'pocket_pair_mid' : 'pocket_pair_low';
  if (lo >= 8) return 'two_broadway';
  if (hi === 12) return suited ? 'ace_suited' : 'ace_offsuit';
  if (suited && gap <= 2 && lo >= 2) return 'suited_connector';
  if (suited) return 'suited';
  if (gap === 1 && lo >= 3) return 'connector';
  return 'weak';
}

export function postflopKind(hole, board) {
  const all = [...hole, ...board];
  const sAll = evaluate(all), sBoard = evaluate(board);
  if (board.length === 5 && sAll === sBoard) return 'board_plays';
  const cAll = category(sAll), cBoard = category(sBoard);
  if (cAll >= 4 && cAll > cBoard) return ['straight', 'flush', 'full_house', 'quads', 'straight_flush'][cAll - 4];
  const [r1, r2] = hole.map(rankOf);
  const br = board.map(rankOf);
  const sorted = [...new Set(br)].sort((x, y) => y - x);
  if (cAll === 3 && cBoard < 3) return r1 === r2 ? 'set' : 'trips';
  if (r1 === r2) {
    if (br.includes(r1)) return 'set';
    if (r1 > sorted[0]) return 'overpair';
    return r1 > sorted[sorted.length - 1] ? 'pair_middle' : 'pair_low';
  }
  const m1 = br.includes(r1), m2 = br.includes(r2);
  if (m1 && m2) return 'two_pair';
  if (m1 || m2) {
    const m = m1 ? r1 : r2, kicker = m1 ? r2 : r1;
    if (m === sorted[0]) return kicker >= 9 ? 'top_pair_good_kicker' : 'top_pair_weak_kicker'; // J or better
    return m === sorted[1] ? 'pair_middle' : 'pair_low';
  }
  return 'high_card';
}

export const DRAWS = ['none', 'gutshot', 'open_ended', 'flush_draw', 'combo_draw'];
export function drawKind(hole, board) {
  if (board.length < 3 || board.length > 4) return 'none';
  const all = [...hole, ...board];
  if (category(evaluate(all)) >= 4) return 'none';
  let flush = false;
  for (let s = 0; s < 4; s++) {
    const n = all.filter((c) => suitOf(c) === s).length;
    const nb = board.filter((c) => suitOf(c) === s).length;
    if (n === 4 && nb < 4) flush = true;
  }
  const maskOf = (cs) => cs.reduce((m, c) => m | (1 << rankOf(c)), 0);
  const mAll = maskOf(all), mBoard = maskOf(board);
  let outs = 0;
  for (let r = 0; r < 13; r++) {
    if (mAll & (1 << r)) continue;
    if (straightHigh(mAll | (1 << r)) >= 0 && straightHigh(mBoard | (1 << r)) < 0) outs++;
  }
  const straight = outs >= 2 ? 'open_ended' : outs === 1 ? 'gutshot' : null;
  if (flush && straight) return 'combo_draw';
  if (flush) return 'flush_draw';
  return straight || 'none';
}

// ---------------- betting state machine (No-Limit) ----------------
//
// Amounts: a bet/raise is given as `to` = the player's total contribution on this street after
// the action. Rules (heads-up NL):
//   * minimum bet = the big blind; minimum raise increment = the last full bet/raise increment
//     on this street (at least the big blind);
//   * the maximum is all of the player's chips (anything the opponent cannot match comes back
//     as uncalled chips when the hand is settled);
//   * a player may always go all-in even when it is less than a minimum raise, but such a short
//     all-in raise does not reopen the betting for a player who has already acted
//     (tracked by hand.raiseOk; heads-up the opponent of an all-in player can never raise anyway).

export function shuffledDeck(rng = Math.random) {
  const d = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/** Start a hand. stacks: [p0, p1]; button posts the small blind and acts first preflop. */
export function newHand(stacks, button, rng = Math.random) {
  const deck = shuffledDeck(rng);
  const hand = {
    stacks: [...stacks], total: [0, 0], contrib: [0, 0], button,
    holes: [[deck.pop(), deck.pop()], [deck.pop(), deck.pop()]],
    board: [], deck, street: 0, acted: [false, false], raiseOk: [true, true], lastInc: BB,
    toAct: button, history: [], log: [], done: false, result: null, runoutFrom: null,
  };
  const bb = 1 - button;
  post(hand, button, SB); hand.log.push({ street: 0, who: button, act: 'sb', amount: hand.total[button], allin: hand.stacks[button] === 0 });
  post(hand, bb, BB); hand.log.push({ street: 0, who: bb, act: 'bb', amount: hand.total[bb], allin: hand.stacks[bb] === 0 });
  if (hand.stacks[0] === 0 || hand.stacks[1] === 0) {
    // someone is all-in from the blind: only the small blind may still have to call
    const short = hand.contrib[button] < hand.contrib[bb] && hand.stacks[button] > 0;
    if (!short) runOut(hand);
  }
  return hand;
}

function post(hand, p, amt) {
  const a = Math.min(amt, hand.stacks[p]);
  hand.stacks[p] -= a; hand.contrib[p] += a; hand.total[p] += a;
  return a;
}

export const toCall = (hand, p = hand.toAct) => Math.max(0, hand.contrib[1 - p] - hand.contrib[p]);
export const potSize = (hand) => hand.total[0] + hand.total[1];
export const minIncrement = (hand) => Math.max(BB, hand.lastInc);

/**
 * Legal bet/raise sizes for the player to act, as totals for this street, or null.
 * { kind: 'bet'|'raise', min, max (= all-in), eff (= the opponent's all-in; sizes >= eff are
 *   equivalent to max), cur (= the bet being faced) }
 */
export function raiseRange(hand, p = hand.toAct) {
  if (hand.done) return null;
  const o = 1 - p;
  if (!hand.raiseOk[p] || hand.stacks[o] === 0 || hand.stacks[p] === 0) return null;
  const cur = hand.contrib[o];
  const max = hand.contrib[p] + hand.stacks[p];
  if (max <= cur) return null; // cannot even complete a call
  const eff = Math.min(max, cur + hand.stacks[o]);
  const min = Math.min(max, cur + minIncrement(hand));
  return { kind: hand.street > 0 && cur === 0 ? 'bet' : 'raise', min, max, eff, cur };
}

/** Basic legal action kinds: fold/check/call/bet/raise. */
export function legalActions(hand) {
  if (hand.done) return [];
  const tc = toCall(hand);
  const r = raiseRange(hand);
  if (tc > 0) return r ? ['fold', 'call', 'raise'] : ['fold', 'call'];
  return r ? ['check', r.kind] : ['check'];
}

/** Chips the player to act would add for an action (`to` = street total for bet/raise). */
export function amountFor(hand, act, to = 0) {
  const p = hand.toAct;
  if (act === 'call') return Math.min(toCall(hand, p), hand.stacks[p]);
  if (act === 'bet' || act === 'raise') return to - hand.contrib[p];
  return 0;
}

// ---------- discrete sizes (Jev's options; the human UI uses the same formulas for its chips) ----------

/** Preflop: raise to k × the bet currently faced (the big blind when unraised). */
export const PREFLOP_SIZES = [['r2x', 2], ['r3x', 3], ['r4x', 4]];
/** Postflop: bet f × pot, or raise by f × (pot after calling) — the standard "pot-sized raise". */
export const POSTFLOP_SIZES = [['b33', 1 / 3], ['b50', 1 / 2], ['b75', 3 / 4], ['b100', 1], ['b200', 2]];
export const SIZE_IDS = [...PREFLOP_SIZES.map((x) => x[0]), ...POSTFLOP_SIZES.map((x) => x[0]), 'allin'];

/** Street total for a bet/raise of `frac` × pot (after calling), not clamped. */
export function potFractionTo(hand, frac, p = hand.toAct) {
  const cur = hand.contrib[1 - p];
  return cur + frac * (potSize(hand) + toCall(hand, p));
}

export const clampTo = (r, x) => Math.min(r.max, Math.max(r.min, Math.round(x)));

export const SIZE_WORDS = ['small', 'medium', 'large', 'overbet', 'allin'];
export const FRACS = ['tiny', 'third', 'half', 'three_quarters', 'pot', 'one_and_half', 'double', 'more'];

/** Raise increment relative to the pot after calling. */
function potRatio(hand, to, p) {
  const cur = hand.contrib[1 - p];
  return (to - cur) / Math.max(1, potSize(hand) + toCall(hand, p));
}
export function fracBucket(ratio) {
  return ratio < 0.25 ? 'tiny' : ratio < 0.42 ? 'third' : ratio < 0.62 ? 'half' : ratio < 0.87 ? 'three_quarters'
    : ratio < 1.25 ? 'pot' : ratio < 1.75 ? 'one_and_half' : ratio < 2.5 ? 'double' : 'more';
}
/** Semantic size of a bet/raise to `to` by player p (call before applying it). */
export function sizeWord(hand, to, p = hand.toAct) {
  const r = raiseRange(hand, p);
  if (r && to >= r.eff) return 'allin';
  if (hand.street === 0) {
    const mult = to / Math.max(1, hand.contrib[1 - p]);
    return mult <= 2.2 ? 'small' : mult <= 3.2 ? 'medium' : mult <= 4.5 ? 'large' : 'overbet';
  }
  const x = potRatio(hand, to, p);
  return x < 0.4 ? 'small' : x < 0.8 ? 'medium' : x < 1.15 ? 'large' : 'overbet';
}

/**
 * Jev's discrete bet/raise options: legal, distinct after clamping to [min raise, all-in].
 * Any size that would put the opponent all-in (or more) merges into 'allin'. When two sizes clamp
 * to the same amount the one whose nominal size is closest is kept.
 * -> [{ id, to, add, size, frac }] in increasing order, 'allin' last.
 */
export function sizeOptions(hand) {
  const r = raiseRange(hand);
  if (!r) return [];
  const p = hand.toAct;
  const cands = hand.street === 0
    ? PREFLOP_SIZES.map(([id, k]) => [id, r.cur * k])
    : POSTFLOP_SIZES.map(([id, f]) => [id, potFractionTo(hand, f)]);
  const byAmount = new Map();
  for (const [id, nominal] of cands) {
    const to = clampTo(r, nominal);
    if (to >= r.eff) continue;
    const prev = byAmount.get(to);
    if (!prev || Math.abs(nominal - to) < Math.abs(prev.nominal - to)) byAmount.set(to, { id, nominal });
  }
  const out = [...byAmount.entries()].sort((a, b) => a[0] - b[0]).map(([to, { id }]) => ({ id, to }));
  out.push({ id: 'allin', to: r.max });
  return out.map((o) => ({ ...o, add: o.to - hand.contrib[p], size: sizeWord(hand, o.to), frac: fracBucket(potRatio(hand, o.to, p)) }));
}

/** Every option id Jev may choose now, with the concrete action it maps to. */
export function jevOptions(hand) {
  const out = [];
  const kind = raiseRange(hand)?.kind;
  for (const a of legalActions(hand)) if (a === 'fold' || a === 'check' || a === 'call') out.push({ id: a, act: a, to: 0 });
  for (const o of sizeOptions(hand)) out.push({ id: o.id, act: kind, to: o.to });
  return out;
}

/** Update opponent-profile stats for the player about to act (call BEFORE applyAction). */
export function recordStats(stats, hand, act) {
  const s = stats[hand.toAct];
  if (act === 'bet' || act === 'raise') s.agg++;
  else if (act === 'check' || act === 'call') s.pass++;
  if (toCall(hand) > 0) { s.faced++; if (act === 'fold') s.folds++; }
}
export const emptyStats = () => [{ agg: 0, pass: 0, faced: 0, folds: 0 }, { agg: 0, pass: 0, faced: 0, folds: 0 }];

export function applyAction(hand, act, to = 0) {
  const legal = legalActions(hand);
  if (!legal.includes(act)) throw new Error(`illegal action ${act} (legal: ${legal.join(',')})`);
  const p = hand.toAct, o = 1 - p;
  let size = null;
  if (act === 'bet' || act === 'raise') {
    const r = raiseRange(hand);
    if (!Number.isInteger(to) || to < r.min || to > r.max) throw new Error(`illegal ${act} size ${to} (range ${r.min}..${r.max})`);
    size = sizeWord(hand, to);
    const inc = to - r.cur;
    if (inc >= minIncrement(hand)) { hand.lastInc = inc; hand.raiseOk[o] = true; } // full raise: reopens
    else if (hand.acted[o]) hand.raiseOk[o] = false; // short all-in: does not reopen
    hand.acted[o] = false;
  }
  const amt = amountFor(hand, act, to);
  hand.history.push({ street: STREETS[hand.street], actor: p, act, ...(size ? { size } : {}) });
  if (act === 'fold') {
    hand.log.push({ street: hand.street, who: p, act });
    return settle(hand, o);
  }
  post(hand, p, amt);
  hand.log.push({ street: hand.street, who: p, act, amount: act === 'check' ? 0 : act === 'call' ? amt : hand.contrib[p], allin: hand.stacks[p] === 0 && amt > 0 });
  hand.acted[p] = true;
  const matched = hand.contrib[0] === hand.contrib[1]
    || (hand.contrib[p] < hand.contrib[o] && hand.stacks[p] === 0);
  // street closes once both have acted and bets are matched, or bets are matched and someone is all-in
  if (matched && ((hand.acted[0] && hand.acted[1]) || hand.stacks[p] === 0 || hand.stacks[o] === 0)) return endStreet(hand);
  hand.toAct = o;
  return hand;
}

function endStreet(hand) {
  if (hand.stacks[0] === 0 || hand.stacks[1] === 0 || hand.street === 3) return runOut(hand);
  nextStreet(hand);
  return hand;
}

function nextStreet(hand) {
  hand.street++;
  const n = hand.street === 1 ? 3 : 1;
  for (let i = 0; i < n; i++) hand.board.push(hand.deck.pop());
  hand.contrib = [0, 0]; hand.acted = [false, false]; hand.raiseOk = [true, true]; hand.lastInc = 0;
  hand.toAct = 1 - hand.button; // big blind acts first after the flop
}

function runOut(hand) {
  if (hand.board.length < 5) hand.runoutFrom = hand.board.length; // all-in before the river
  while (hand.board.length < 5) hand.board.push(hand.deck.pop());
  hand.street = 3;
  const s0 = evaluate([...hand.holes[0], ...hand.board]);
  const s1 = evaluate([...hand.holes[1], ...hand.board]);
  return settle(hand, s0 > s1 ? 0 : s1 > s0 ? 1 : -1, [s0, s1]);
}

/** Award the pot. winner -1 = split. Uncalled chips are returned first. */
function settle(hand, winner, scores = null) {
  const matched = Math.min(hand.total[0], hand.total[1]);
  const returned = [0, 1].map((p) => hand.total[p] - matched);
  for (const p of [0, 1]) hand.stacks[p] += returned[p];
  const pot = matched * 2;
  const won = [0, 0];
  if (winner === -1) {
    const half = Math.floor(pot / 2);
    won[0] = half; won[1] = half;
    if (pot % 2) won[1 - hand.button]++; // odd chip (cannot happen: both put in the same) to the big blind
  } else won[winner] = pot;
  hand.stacks[0] += won[0]; hand.stacks[1] += won[1];
  hand.total = [0, 0]; hand.contrib = [0, 0];
  hand.done = true;
  hand.result = { winner, pot, won, returned, showdown: !!scores, names: scores ? scores.map(handName) : null };
  return hand;
}

// ---------------- payload for Jev (from player p's point of view) ----------------

function oppAggression(s) {
  const n = s.agg + s.pass;
  if (n < 6) return 'unknown';
  const r = s.agg / n;
  return r < 0.2 ? 'passive' : r < 0.4 ? 'balanced' : r < 0.6 ? 'aggressive' : 'very_aggressive';
}
function oppFoldToBet(s) {
  if (s.faced < 4) return 'unknown';
  const r = s.folds / s.faced;
  return r < 0.2 ? 'rarely' : r < 0.45 ? 'sometimes' : 'often';
}

export function potOddsBucket(tc, pot) {
  if (tc <= 0) return 'none';
  const need = tc / (pot + tc);
  return need < 0.2 ? 'great' : need < 0.28 ? 'good' : need < 0.36 ? 'fair' : 'poor';
}

/** Stack-to-pot ratio bucket (effective stack behind / pot). */
export function sprBucket(eff, pot) {
  const x = eff / Math.max(1, pot);
  return x < 1 ? 'very_low' : x < 2.5 ? 'low' : x < 6 ? 'medium' : x < 13 ? 'high' : 'very_high';
}

// ---------------- raw payload (no code-computed evaluation at all) ----------------

export const HAND_NAMES = [...CATS, 'royal_flush'];

/** Neutral record of a finished hand, kept by the UI for the raw payload's recent-hands list. */
export function summarizeHand(hand, handNo) {
  const r = hand.result;
  return {
    handNo, winner: r.winner, pot: r.pot, showdown: r.showdown, street: hand.street, button: hand.button,
    holes: hand.holes.map((x) => [...x]), board: [...hand.board], names: r.names ? [...r.names] : null,
  };
}

function pastFor(r, p) {
  const o = 1 - p;
  const out = {
    hand_no: r.handNo,
    winner: r.winner === -1 ? 'split' : r.winner === p ? 'jev' : 'opp',
    pot: r.pot,
    ended: r.showdown ? 'showdown' : 'fold',
    street: STREETS[r.street],
    jev_dealer: r.button === p,
    jev_hole: r.holes[p].map(cardStr),
    board: r.board.map(cardStr),
  };
  if (r.showdown) {
    out.opp_hole = r.holes[o].map(cardStr);
    out.jev_hand = r.names[p];
    out.opp_hand = r.names[o];
  }
  return out;
}

const RAW_ACT = { sb: 'small_blind', bb: 'big_blind' };

/**
 * Raw payload validated by shared/games/holdem.js (raw.schema): only the literal record,
 * from player p's point of view (p must be the player to act). past: summarizeHand() records.
 */
export function makeRawPayload(hand, p, past = [], handNo = 1) {
  const o = 1 - p;
  const legal = legalActions(hand).filter((a) => a === 'fold' || a === 'check' || a === 'call');
  return {
    hand_no: handNo,
    street: STREETS[hand.street],
    hole: hand.holes[p].map(cardStr),
    board: hand.board.map(cardStr),
    dealer: hand.button === p ? 'jev' : 'opp',
    pot: potSize(hand),
    jev_stack: hand.stacks[p],
    opp_stack: hand.stacks[o],
    jev_bet: hand.contrib[p],
    opp_bet: hand.contrib[o],
    actions: hand.log.slice(-32).map((e) => ({
      street: STREETS[e.street], actor: e.who === p ? 'jev' : 'opp', act: RAW_ACT[e.act] || e.act,
      amount: e.amount ?? 0, allin: !!e.allin,
    })),
    legal,
    call_amount: legal.includes('call') ? amountFor(hand, 'call') : 0,
    options: sizeOptions(hand).map(({ id, to, add }) => ({ id, to, add })),
    recent: past.slice(-6).map((r) => pastFor(r, p)),
  };
}

/**
 * Hinted payload validated by shared/games/holdem.js: exactly the raw payload (see
 * makeRawPayload) plus the code-computed buckets. p must be the player to act.
 * stats: emptyStats()-shaped session stats; we read the opponent's entry.
 */
export function makePayload(hand, p, stats, past = [], handNo = 1, samples = 600, rng = Math.random) {
  const o = 1 - p;
  const raw = makeRawPayload(hand, p, past, handNo);
  const hole = hand.holes[p], board = hand.board;
  const e = equity(hole, board, samples, rng);
  const eff = Math.min(hand.stacks[p], hand.stacks[o]);
  const pot = potSize(hand);
  const lead = (hand.stacks[p] + hand.total[p]) - (hand.stacks[o] + hand.total[o]);
  return {
    ...raw,
    options: sizeOptions(hand), // raw {id, to, add} + size word + pot fraction
    hand: hand.street === 0 ? preflopKind(hole) : postflopKind(hole, board),
    draw: drawKind(hole, board),
    equity: equityBucket(e),
    pot_odds: potOddsBucket(toCall(hand, p), pot),
    opp_aggression: oppAggression(stats[o]),
    opp_fold_to_bet: oppFoldToBet(stats[o]),
    stack: eff >= 150 ? 'deep' : eff >= 70 ? 'medium' : eff >= 30 ? 'short' : 'very_short',
    spr: sprBucket(eff, pot),
    pot_size: pot < 8 ? 'small' : pot < 30 ? 'medium' : pot < 100 ? 'large' : 'huge',
    chip_lead: lead > 120 ? 'well_ahead' : lead > 30 ? 'ahead' : lead >= -30 ? 'even' : lead >= -120 ? 'behind' : 'well_behind',
    action_sizes: hand.history.slice(-24).map((x) => ({ street: x.street, actor: x.actor === p ? 'jev' : 'opp', act: x.act, ...(x.size ? { size: x.size } : {}) })),
  };
}

// ---------------- built-in bot policy (raw weights; wrapped in API shape by holdem.js) ----------------

const EQ_MID = { very_weak: 0.22, weak: 0.36, marginal: 0.46, decent: 0.54, strong: 0.64, very_strong: 0.78, monster: 0.92 };
const NEED = { none: 0, great: 0.17, good: 0.24, fair: 0.32, poor: 0.4 };
const SIZE_DISCOUNT = { small: 0.03, medium: 0.045, large: 0.06, overbet: 0.08, allin: 0.11 };
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sig = (x) => 1 / (1 + Math.exp(-x));

// Relative preference for each size word by intent.
const SIZE_PREF = {
  value: { small: 0.6, medium: 1, large: 0.8, overbet: 0.25, allin: 0.05 },
  big: { small: 0.25, medium: 0.7, large: 1, overbet: 0.7, allin: 0.35 },
  bluff: { small: 0.9, medium: 1, large: 0.45, overbet: 0.15, allin: 0.04 },
};

/** Split `total` weight across the size options. */
function spread(opts, total, intent, pl, eq) {
  const w = {};
  if (!opts.length || total <= 0) return w;
  const low = pl.spr === 'very_low' || pl.spr === 'low';
  const pref = opts.map((o) => {
    let x = SIZE_PREF[intent][o.size];
    if (o.size === 'allin') {
      if (low && eq > 0.6) x *= 6; // commit with a good hand when little is left behind
      if (pl.stack === 'very_short' && eq > 0.5) x *= 8; // short stack: push or fold
      if (eq > 0.88) x *= 2.5;
    }
    return Math.max(0.01, x);
  });
  const sum = pref.reduce((a, b) => a + b, 0);
  opts.forEach((o, i) => { w[o.id] = total * pref[i] / sum; });
  return w;
}

export function botPolicy(pl) {
  const street = pl.street;
  const oppAggr = pl.action_sizes.filter((x) => x.actor === 'opp' && (x.act === 'bet' || x.act === 'raise'));
  const oppAggrStreet = oppAggr.filter((x) => x.street === street).length;
  const profAdj = { unknown: 0, passive: -0.04, balanced: 0, aggressive: 0.03, very_aggressive: 0.06 }[pl.opp_aggression];
  // random-hand equity overstates us against a betting range; discount per opponent bet/raise, more for big ones
  const disc = Math.min(0.25, oppAggr.reduce((a, x) => a + (SIZE_DISCOUNT[x.size] ?? 0.045), 0));
  let eq = EQ_MID[pl.equity] - disc + (oppAggr.length ? profAdj : 0);
  eq = clamp(eq, 0.02, 0.98);
  const drawBonus = street === 'river' ? 0 : { none: 0, gutshot: 0.04, open_ended: 0.1, flush_draw: 0.12, combo_draw: 0.22 }[pl.draw];
  const foldy = { unknown: 0.15, rarely: 0.05, sometimes: 0.15, often: 0.3 }[pl.opp_fold_to_bet];
  const opts = pl.options;
  const w = {};
  if (pl.legal.includes('call')) {
    const need = NEED[pl.pot_odds] || 0.2;
    const eqc = eq + drawBonus * 0.5;
    w.call = sig(12 * (eqc - need));
    w.fold = 1 - w.call;
    if (pl.stack === 'very_short' && eq > 0.45) { w.call += 0.3; } // too short to fold a fair hand
    if (opts.length) {
      let r;
      if (eq > 0.6) r = { total: (eq - 0.45) * 2.5, intent: eq > 0.78 ? 'big' : 'value' };
      else if (drawBonus > 0.1) r = { total: 0.12 + foldy * 0.3, intent: 'bluff' };
      else r = { total: 0.03 + foldy * 0.05, intent: 'bluff' };
      if (eq > 0.85) { r.total *= 0.7; w.call += 0.3; } // occasional slow-play
      Object.assign(w, spread(opts, r.total, r.intent, pl, eq));
    }
  } else {
    w.check = 1;
    if (opts.length) {
      let b, intent;
      if (eq >= 0.52) { b = (eq - 0.35) * 2.2; intent = eq > 0.75 ? 'big' : 'value'; } else {
        b = 0.08 + foldy * 0.6 + drawBonus * 1.5; intent = 'bluff'; // bluff / semi-bluff
        if (street === 'river') b = 0.05 + foldy * 0.7; // pure bluffs only on the river
      }
      if (eq > 0.85) b *= 0.7; // slow-play sometimes
      b = clamp(b, 0.03, 0.95);
      w.check = 1 - b;
      if (eq > 0.85) w.check = Math.max(w.check, 0.2);
      Object.assign(w, spread(opts, b, intent, pl, eq));
    }
  }
  const out = {};
  for (const a of pl.legal) out[a] = Math.max(0.001, w[a] ?? 0);
  for (const o of opts) out[o.id] = Math.max(0.001, w[o.id] ?? 0);
  const bluff = clamp(0.25 + profAdj * 3 + (oppAggrStreet ? 0.05 : -0.1), 0.03, 0.9);
  return { action: out, opp_bluffing: bluff, ahead: clamp(eq, 0.02, 0.98) };
}
