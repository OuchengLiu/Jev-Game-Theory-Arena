// Liar's Dice (heads-up) — Jev plays one side.
//
// Clean ablation (see shared/prompts.js):
//   raw  = base(): rules, neutral goal, Jev's own dice (1s marked wild — a rule, not
//          analysis), dice counts, this round's full bid history, the results of earlier
//          rounds and the legal options described literally.
//   hinted = the identical base + `state.analysis` (opponent bluffing style, how many of
//          the current bid's dice Jev holds and its likelihood judged from Jev's own dice)
//          + an " Analysis: …" suffix on each option (own matching dice, likelihood word).
//   All probability work happens in the browser (js/games/liarsdice-core.js); the hinted
//   payload is the raw record + opp_style / current_likelihood / per-option likelihood.
// Both modes use the same candidate option set (same ids 'challenge', 'b0'..'b9') and the
// main question id 'action'.
import { S, SchemaError } from '../schema.js';

const LIKELIHOOD = S.enumv('certain', 'very_likely', 'likely', 'coin_flip', 'unlikely', 'very_unlikely', 'impossible');
const OPTION_IDS = ['challenge', ...Array.from({ length: 10 }, (_, i) => `b${i}`)];
const QTY = S.int(1, 10);
const FACE = S.int(2, 6); // 1s are wild and cannot be bid
const WHO = S.enumv('jev', 'opp');
const DIE = S.int(1, 6);

const FACE_NAME = { 2: 'twos', 3: 'threes', 4: 'fours', 5: 'fives', 6: 'sixes' };
const LIKELY_WORDS = {
  certain: 'certainly true (your own dice already make it true)',
  very_likely: 'very likely true',
  likely: 'likely true',
  coin_flip: 'a coin flip',
  unlikely: 'unlikely to be true',
  very_unlikely: 'very unlikely to be true',
  impossible: 'impossible (not enough hidden dice could exist to make it true)',
};
const STYLE_WORDS = {
  unknown: 'unknown so far',
  honest: 'mostly honest: their bids have usually been true when revealed',
  bluffs_sometimes: 'bluffs sometimes: some of their revealed bids were false',
  bluffs_often: 'bluffs often: many of their revealed bids were false',
};

const RULES = [
  "A bid claims that, across BOTH players' dice combined, at least a certain number of dice show a certain face.",
  '1s are wild: they count as every face. Nobody bids on 1s, so bids are on faces 2 to 6.',
  'Each new bid must be higher: more dice, or the same number of dice with a higher face.',
  "Instead of bidding you may call Liar on the opponent's bid. All dice are revealed. If the bid is true the caller loses a die; if false the bidder loses a die.",
  'The player who lost a die opens the next round. A player with no dice left loses the match.',
];

const diceWord = (n) => (n === 1 ? 'die' : 'dice');
const bidText = (qty, face) => `at least ${qty} ${diceWord(qty)} showing ${FACE_NAME[face]}`;
const matchText = (n) => (n === 0 ? 'none of them' : n === 1 ? 'one of them' : `${n} of them`);
const isHigher = (a, b) => a.qty > b.qty || (a.qty === b.qty && a.face > b.face);

const BID = S.obj({ by: WHO, qty: QTY, face: FACE });
const RAW_FIELDS = {
  jev_dice: S.list(DIE, 5),
  opp_dice_count: S.int(1, 5),
  // Every bid of this round in order; the last one (if any) is the opponent's current bid.
  // A strictly rising sequence over 10 dice x 5 faces has at most 50 bids.
  bids: S.list(BID, 50),
  // Earlier rounds of this match (a match has at most 9 rounds).
  past_rounds: S.list(S.obj({
    bid: BID,                       // the bid that was challenged
    called_by: WHO,                 // who called Liar
    actual: S.int(0, 10),           // dice actually showing that face, 1s included
    loser: WHO,                     // who lost a die
    opp_dice: S.list(DIE, 5),       // the opponent's dice revealed at the end of that round
  }), 9),
};
const RAW_OPTION = { id: S.enumv(OPTION_IDS), qty: S.optional(QTY), face: S.optional(FACE) };

const RAW_SCHEMA = S.obj({ ...RAW_FIELDS, options: S.list(S.obj(RAW_OPTION), 11) });
// Hinted payload = the raw record + code-computed likelihood / style buckets.
const HINTED_SCHEMA = S.obj({
  ...RAW_FIELDS,
  options: S.list(S.obj({ ...RAW_OPTION, likelihood: S.optional(LIKELIHOOD) }), 11),
  opp_style: S.enumv(Object.keys(STYLE_WORDS)),
  current_likelihood: S.optional(LIKELIHOOD), // required iff there is a current bid
});

/** Consistency checks the flat schema cannot express. Returns the current bid or null. */
function validate({ jev_dice, opp_dice_count, bids, past_rounds, options }, hintedMode) {
  if (jev_dice.length < 1) throw new SchemaError('payload.jev_dice: empty');
  const total = jev_dice.length + opp_dice_count;
  for (let i = 0; i < bids.length; i++) {
    const b = bids[i];
    if (b.qty > total) throw new SchemaError('payload.bids: bid exceeds dice on the table');
    if (i > 0 && (!isHigher(b, bids[i - 1]) || b.by === bids[i - 1].by)) throw new SchemaError('payload.bids: not a legal sequence');
  }
  const current = bids.length ? bids[bids.length - 1] : null;
  if (current && current.by !== 'opp') throw new SchemaError('payload.bids: last bid must be the opponent\'s');
  for (const r of past_rounds) {
    if (r.called_by === r.bid.by) throw new SchemaError('payload.past_rounds: caller must differ from bidder');
    const expected = r.actual >= r.bid.qty ? r.called_by : r.bid.by;
    if (r.loser !== expected || r.opp_dice.length < 1) throw new SchemaError('payload.past_rounds: inconsistent result');
  }
  if (!options.length) throw new SchemaError('payload.options: empty');
  const ids = new Set();
  for (const o of options) {
    if (ids.has(o.id)) throw new SchemaError('payload.options: duplicate id');
    ids.add(o.id);
    if (o.id === 'challenge') {
      if (!current) throw new SchemaError('payload.options: challenge without a bid');
      if (o.qty !== undefined || o.face !== undefined || o.likelihood !== undefined) throw new SchemaError('payload.options: challenge with bid fields');
    } else {
      if (o.qty === undefined || o.face === undefined || (hintedMode && o.likelihood === undefined)) {
        throw new SchemaError('payload.options: bid option incomplete');
      }
      if (o.qty > total || (current && !isHigher(o, current))) throw new SchemaError('payload.options: illegal bid');
    }
  }
  return current;
}

const who = (by) => (by === 'jev' ? 'You' : 'The opponent');
const whose = (by) => (by === 'jev' ? 'your' : "the opponent's");

/** Shared base: rules, neutral goal, own dice, counts, full bidding record, literal options. */
function base(p) {
  const current = validate(p, false);
  const { jev_dice, opp_dice_count, bids, past_rounds, options } = p;
  const mine = jev_dice.length;
  const total = mine + opp_dice_count;
  const dice = [...jev_dice].sort((a, b) => a - b);
  const state = {
    game: "Liar's Dice, heads-up, between you and one opponent. Each player rolls their dice secretly under a cup.",
    rules: RULES,
    goal: 'Win the match: make the opponent lose all their dice before you lose yours.',
    round: `Round ${past_rounds.length + 1} of the match.`,
    your_dice: `${dice.join(', ')}${dice.includes(1) ? ' (1s are wild)' : ''}`,
    dice_count: `You have ${mine} ${diceWord(mine)}. The opponent has ${opp_dice_count} hidden ${diceWord(opp_dice_count)}. ${total} dice in total.`,
    bids_this_round: bids.length
      ? bids.map((b, i) => `${i + 1}. ${who(b.by)} bid ${bidText(b.qty, b.face)}.`)
      : ['No bids yet: you open this round.'],
    current_bid: current
      ? `The opponent's bid of ${bidText(current.qty, current.face)} stands. You must raise it or call Liar.`
      : 'No bid yet: you open this round.',
    previous_rounds: past_rounds.length
      ? past_rounds.map((r, i) => `Round ${i + 1}: ${who(r.called_by)} called Liar on ${whose(r.bid.by)} bid of ${bidText(r.bid.qty, r.bid.face)}. `
        + `The dice showed ${r.actual} ${FACE_NAME[r.bid.face]} (1s included). ${who(r.loser)} lost a die. `
        + `The opponent's revealed dice were ${r.opp_dice.join(', ')}.`)
      : ['This is the first round of the match.'],
  };

  const criteria = {};
  for (const o of options) {
    criteria[o.id] = o.id === 'challenge'
      ? `Call Liar on the opponent's bid of ${bidText(current.qty, current.face)}.`
      : `Bid ${bidText(o.qty, o.face)}.`;
  }

  const questions = {
    action: {
      type: 'choice',
      instructions: current ? 'Do you raise the bid or call Liar?' : 'Which opening bid do you make?',
      criteria,
    },
  };
  if (current) {
    questions.opp_bluffing = {
      type: 'noul',
      instructions: `Is the opponent's current bid (${bidText(current.qty, current.face)}) a bluff, meaning fewer dice actually show ${FACE_NAME[current.face]} (counting 1s) than they claim?`,
    };
  }
  return { state, questions };
}

function hinted(p) {
  const current = validate(p, true);
  if (!!current !== (p.current_likelihood !== undefined)) throw new SchemaError('payload.current_likelihood: does not match the bids');
  const req = base({
    jev_dice: p.jev_dice,
    opp_dice_count: p.opp_dice_count,
    bids: p.bids,
    past_rounds: p.past_rounds,
    options: p.options.map(({ id, qty, face }) => ({ id, qty, face })),
  });
  const count = (face) => p.jev_dice.filter((d) => d === face || d === 1).length;
  const mine = p.jev_dice.length;
  req.state.analysis = {
    opponent_style: STYLE_WORDS[p.opp_style],
    dice_balance: mine > p.opp_dice_count ? 'You are ahead on dice.' : mine < p.opp_dice_count ? 'You are behind on dice.' : 'Dice are level.',
    current_bid: current
      ? `You hold ${matchText(count(current.face))} yourself. Judging only from your own dice, the opponent's bid is ${LIKELY_WORDS[p.current_likelihood]}.`
      : 'No bid yet.',
  };
  const crit = req.questions.action.criteria;
  for (const o of p.options) {
    crit[o.id] += o.id === 'challenge'
      ? ` Analysis: you hold ${matchText(count(current.face))}; judging only from your own dice, their bid is ${LIKELY_WORDS[p.current_likelihood]}.`
      : ` Analysis: you hold ${matchText(count(o.face))} (1s count as ${FACE_NAME[o.face]}); judging only from your own dice, this bid is ${LIKELY_WORDS[o.likelihood]}.`;
  }
  return req;
}

export default {
  schema: HINTED_SCHEMA,
  build: hinted,
  raw: { schema: RAW_SCHEMA, build: base },
};
