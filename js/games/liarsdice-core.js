// Liar's Dice — pure game logic (no DOM, no engine imports) so it can be unit-tested
// from Node. Used by js/games/liarsdice.js.
//
// Rules implemented: heads-up, 5 dice each, 1s are wild (count as every face) and
// cannot be bid themselves, so a bid is "at least `qty` dice showing `face`" with
// face in 2..6. A raise is a higher quantity (any face) or the same quantity with a
// higher face.

export const FACES = [2, 3, 4, 5, 6];
export const START_DICE = 5;
export const MAX_BID_OPTIONS = 10;
export const BID_IDS = Array.from({ length: MAX_BID_OPTIONS }, (_, i) => `b${i}`);
export const LIKELIHOODS = ['certain', 'very_likely', 'likely', 'coin_flip', 'unlikely', 'very_unlikely', 'impossible'];
export const STYLES = ['unknown', 'honest', 'bluffs_sometimes', 'bluffs_often'];
export const HISTORY_MAX = 12; // bids sent to Jev per round (most recent)

export const rollDice = (n, rng = Math.random) => Array.from({ length: n }, () => 1 + Math.floor(rng() * 6));

/** Number of dice matching `face`, counting 1s as wild. */
export const countFace = (dice, face) => dice.filter((d) => d === face || d === 1).length;

/** Is bid `a` strictly higher than bid `b`? */
export const isHigher = (a, b) => a.qty > b.qty || (a.qty === b.qty && a.face > b.face);

export function isLegalBid(bid, current, totalDice) {
  if (!bid || !Number.isInteger(bid.qty) || !FACES.includes(bid.face)) return false;
  if (bid.qty < 1 || bid.qty > totalDice) return false;
  return !current || isHigher(bid, current);
}

/** Smallest legal quantity for `face` given the current bid. */
export const minQty = (face, current) => (!current ? 1 : face > current.face ? current.qty : current.qty + 1);

function choose(n, k) {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** P(X >= need) for X ~ Binomial(n, p). */
export function probAtLeast(need, n, p = 1 / 3) {
  if (need <= 0) return 1;
  if (need > n) return 0;
  let s = 0;
  for (let k = need; k <= n; k++) s += choose(n, k) * p ** k * (1 - p) ** (n - k);
  return Math.min(1, s);
}

/** Probability that `bid` is true, seen from someone holding `ownDice` against `oppCount` hidden dice. */
export function bidProb(ownDice, oppCount, bid) {
  return probAtLeast(bid.qty - countFace(ownDice, bid.face), oppCount, 1 / 3);
}

export function bucket(ownDice, oppCount, bid) {
  const need = bid.qty - countFace(ownDice, bid.face);
  if (need <= 0) return 'certain';
  if (need > oppCount) return 'impossible';
  const p = probAtLeast(need, oppCount);
  return p >= 0.85 ? 'very_likely' : p >= 0.62 ? 'likely' : p >= 0.38 ? 'coin_flip' : p >= 0.15 ? 'unlikely' : 'very_unlikely';
}

/**
 * Candidate raises for the player holding `ownDice`: for each face the minimal legal
 * quantity, the most plausible quantity (largest with p >= 0.5) and one above it
 * (when opening: the plausible quantity, one above, and the safe own-dice quantity).
 * At most MAX_BID_OPTIONS, sorted from lowest to highest bid.
 */
export function candidateBids(ownDice, oppCount, current) {
  const total = ownDice.length + oppCount;
  const tiers = [[], [], []];
  for (const face of FACES) {
    const m = minQty(face, current);
    if (m > total) continue;
    let q = m;
    while (q + 1 <= total && bidProb(ownDice, oppCount, { qty: q + 1, face }) >= 0.5) q++;
    if (current) {
      // minimal raise first, then the plausible quantity, then one step of aggression
      tiers[0].push({ qty: m, face });
      if (q > m) tiers[1].push({ qty: q, face });
      if (q + 1 <= total) tiers[2].push({ qty: q + 1, face });
    } else {
      // opening: plausible quantity, one above it, and the safe bid backed by own dice
      tiers[0].push({ qty: q, face });
      const own = countFace(ownDice, face);
      if (own >= 1 && own < q) tiers[1].push({ qty: own, face });
      if (q + 1 <= total) tiers[2].push({ qty: q + 1, face });
    }
  }
  const out = [];
  const seen = new Set();
  for (const tier of tiers) {
    for (const b of tier) {
      const k = `${b.qty}x${b.face}`;
      if (seen.has(k) || out.length >= MAX_BID_OPTIONS) continue;
      seen.add(k);
      out.push(b);
    }
  }
  return out.sort((a, b) => a.qty - b.qty || a.face - b.face);
}

/** Opponent style from how many of their bids turned out true/false at past reveals. */
export function styleBucket(stats) {
  const n = (stats?.honest || 0) + (stats?.bluff || 0);
  if (n < 2) return 'unknown';
  const r = stats.bluff / n;
  return r < 0.2 ? 'honest' : r < 0.45 ? 'bluffs_sometimes' : 'bluffs_often';
}

/** Update style stats with every bid `by` made this round, judged against all dice. */
export function recordBids(stats, bids, by, allDice) {
  const s = { honest: stats?.honest || 0, bluff: stats?.bluff || 0 };
  for (const b of bids) {
    if (b.by !== by) continue;
    if (countFace(allDice, b.face) >= b.qty) s.honest++;
    else s.bluff++;
  }
  return s;
}

/** Resolve a challenge against `bid` given every die on the table. */
export function resolveChallenge(allDice, bid) {
  const count = countFace(allDice, bid.face);
  return { count, bidTrue: count >= bid.qty };
}

/**
 * Build the compact Jev payload (see shared/games/liarsdice.js) from one player's view.
 * `bids`: this round's bids in order, each {by:'jev'|'opp', qty, face}, from that player's view
 * (the last one, if any, is the current bid and must be the opponent's).
 * Returns { payload, optionMap } where optionMap maps option id -> {type:'bid', qty, face} | {type:'challenge'}.
 */
export function makePayload(ownDice, oppCount, bids, oppStats) {
  const current = bids.length ? bids[bids.length - 1] : null;
  const earlier = bids.slice(0, -1).slice(-HISTORY_MAX);
  const optionMap = {};
  const options = [];
  if (current) {
    options.push({ id: 'challenge' });
    optionMap.challenge = { type: 'challenge' };
  }
  candidateBids(ownDice, oppCount, current).forEach((b, i) => {
    const id = BID_IDS[i];
    options.push({ id, qty: b.qty, face: b.face, likelihood: bucket(ownDice, oppCount, b) });
    optionMap[id] = { type: 'bid', qty: b.qty, face: b.face };
  });
  const payload = {
    jev_dice: [...ownDice].sort((a, b) => a - b),
    opp_dice_count: oppCount,
    history: earlier.map((b) => ({ by: b.by, qty: b.qty, face: b.face })),
    opp_style: styleBucket(oppStats),
    options,
  };
  if (current) payload.current_bid = { qty: current.qty, face: current.face, likelihood: bucket(ownDice, oppCount, current) };
  return { payload, optionMap };
}

// ---------------- built-in bot (weights only; the UI wraps them in API shape) ----------------

const VAL = { certain: 1, very_likely: 0.9, likely: 0.72, coin_flip: 0.5, unlikely: 0.28, very_unlikely: 0.1, impossible: 0 };

/**
 * Likelihood-based mixed strategy with occasional bluffs.
 * Returns { action: {id: weight}, oppBluff: probability }.
 */
export function botWeights(payload) {
  const { options, current_bid: cur, opp_style: style } = payload;
  const bids = options.filter((o) => o.id !== 'challenge');
  const lowest = bids.length ? Math.min(...bids.map((o) => o.qty)) : 0;
  const w = {};
  for (const o of bids) {
    const v = VAL[o.likelihood];
    let x = v * v;
    if (o.likelihood === 'unlikely') x += 0.05; // occasional bluff
    if (o.likelihood === 'very_unlikely') x += 0.01;
    x /= 1 + 0.35 * (o.qty - lowest); // prefer small raises
    w[o.id] = x;
  }
  let oppBluff = null;
  if (cur) {
    const v = VAL[cur.likelihood];
    // The opponent's claim is itself evidence: nudge towards believing them.
    const styleAdj = { unknown: 0.1, honest: 0.2, bluffs_sometimes: 0.05, bluffs_often: -0.08 }[style] ?? 0;
    const believe = cur.likelihood === 'certain' ? 1 : cur.likelihood === 'impossible' ? 0 : Math.min(0.97, Math.max(0.03, v + styleAdj * (1 - v)));
    oppBluff = 1 - believe;
    w.challenge = cur.likelihood === 'impossible' ? 50 : 2.2 * oppBluff ** 2;
  }
  return { action: w, oppBluff };
}
