// Liar's Dice (heads-up) — Jev plays one side.
//
// Two request builders (see shared/prompts.js):
//   hinted (default): all probability work happens in the browser
//     (js/games/liarsdice-core.js); Jev sees its own dice, the bidding so far and a
//     likelihood *word* for every candidate action plus the opponent's bluffing style.
//   raw: no code-computed evaluation at all — only Jev's dice, the dice counts, the
//     rules, this round's full bid history, the results of earlier rounds and the
//     legal options described literally.
// Both use the same option ids ('challenge', 'b0'..'b9') and the main question id 'action'.
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
const matchText = (n) => (n === 0 ? 'none of them yourself' : n === 1 ? 'one of them yourself' : `${n} of them yourself`);
const isHigher = (a, b) => a.qty > b.qty || (a.qty === b.qty && a.face > b.face);

/** Shared consistency checks for the option list (the flat schema cannot express them). */
function checkOptions(options, current, total, needLikelihood) {
  if (!options.length) throw new SchemaError('payload.options: empty');
  const ids = new Set();
  for (const o of options) {
    if (ids.has(o.id)) throw new SchemaError('payload.options: duplicate id');
    ids.add(o.id);
    if (o.id === 'challenge') {
      if (!current) throw new SchemaError('payload.options: challenge without a bid');
      if (o.qty !== undefined || o.face !== undefined || o.likelihood !== undefined) throw new SchemaError('payload.options: challenge with bid fields');
    } else {
      if (o.qty === undefined || o.face === undefined || (needLikelihood && o.likelihood === undefined)) {
        throw new SchemaError('payload.options: bid option incomplete');
      }
      if (o.qty > total || (current && !isHigher(o, current))) throw new SchemaError('payload.options: illegal bid');
    }
  }
}

// ---------------------------------------------------------------- hinted ----

const HINTED_SCHEMA = S.obj({
  jev_dice: S.list(DIE, 5),
  opp_dice_count: S.int(1, 5),
  current_bid: S.optional(S.obj({ qty: QTY, face: FACE, likelihood: LIKELIHOOD })),
  history: S.list(S.obj({ by: WHO, qty: QTY, face: FACE }), 12),
  opp_style: S.enumv('unknown', 'honest', 'bluffs_sometimes', 'bluffs_often'),
  options: S.list(S.obj({
    id: S.enumv(OPTION_IDS),
    qty: S.optional(QTY),
    face: S.optional(FACE),
    likelihood: S.optional(LIKELIHOOD),
  }), 11),
});

function buildHinted({ jev_dice, opp_dice_count, current_bid, history, opp_style, options }) {
  if (jev_dice.length < 1) throw new SchemaError('payload.jev_dice: empty');
  checkOptions(options, current_bid, jev_dice.length + opp_dice_count, true);

  const mine = jev_dice.length;
  const count = (face) => jev_dice.filter((d) => d === face || d === 1).length;
  const wilds = jev_dice.filter((d) => d === 1).length;

  const state = {
    game: "Liar's Dice, heads-up, between you and one opponent. Each player rolls their dice secretly under a cup.",
    rules: RULES,
    goal: 'Win the match: lose dice as rarely as possible. Bid what is probably true, occasionally bluff, and call Liar when the opponent overreaches.',
    your_dice: `${jev_dice.join(', ')}${wilds ? ` (the ${wilds === 1 ? '1 is' : `${wilds} ones are`} wild)` : ''}`,
    dice_left: `You have ${mine} ${diceWord(mine)}; the opponent has ${opp_dice_count} hidden ${diceWord(opp_dice_count)}.`,
    match_status: mine > opp_dice_count ? 'You are ahead on dice.' : mine < opp_dice_count ? 'You are behind on dice.' : 'Dice are level.',
    opponent_style: STYLE_WORDS[opp_style],
    bids_this_round: history.length
      ? history.map((b) => `${b.by === 'jev' ? 'You' : 'Opponent'} bid ${bidText(b.qty, b.face)}`)
      : ['(none before the current bid)'],
    current_bid: current_bid
      ? `The opponent just bid ${bidText(current_bid.qty, current_bid.face)}. You hold ${matchText(count(current_bid.face))}. Judging only from your own dice, their bid is ${LIKELY_WORDS[current_bid.likelihood]}. Their bid may also hint at what they hold.`
      : 'No bid yet: you open this round.',
  };

  const criteria = {};
  for (const o of options) {
    criteria[o.id] = o.id === 'challenge'
      ? `Call Liar: challenge the opponent's bid of ${bidText(current_bid.qty, current_bid.face)}. You estimate their bid is ${LIKELY_WORDS[current_bid.likelihood]}. Good when their bid is probably false.`
      : `Bid ${bidText(o.qty, o.face)} (1s count as ${FACE_NAME[o.face]}). You hold ${matchText(count(o.face))}; you estimate this bid is ${LIKELY_WORDS[o.likelihood]}. The opponent may call Liar on it.`;
  }

  const questions = {
    action: {
      type: 'choice',
      instructions: current_bid
        ? 'Raise the bid or call Liar? Pick the action that best protects your dice and wins the match.'
        : 'Which opening bid should you make? Pick the action that best protects your dice and wins the match.',
      criteria,
    },
  };
  if (current_bid) {
    questions.opp_bluffing = {
      type: 'noul',
      instructions: `Is the opponent's current bid (${bidText(current_bid.qty, current_bid.face)}) a bluff, meaning fewer dice actually show ${FACE_NAME[current_bid.face]} (counting 1s) than they claim?`,
    };
  }
  return { state, questions };
}

// ------------------------------------------------------------------- raw ----
// Raw record only. No likelihoods, no style bucket, no counts of Jev's matching dice.

const BID = S.obj({ by: WHO, qty: QTY, face: FACE });
const RAW_SCHEMA = S.obj({
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
  options: S.list(S.obj({
    id: S.enumv(OPTION_IDS),
    qty: S.optional(QTY),
    face: S.optional(FACE),
  }), 11),
});

const who = (by) => (by === 'jev' ? 'You' : 'The opponent');
const whose = (by) => (by === 'jev' ? 'your' : "the opponent's");
const shortBid = (b) => `${b.qty} × ${b.face}`;

function buildRaw({ jev_dice, opp_dice_count, bids, past_rounds, options }) {
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
  checkOptions(options, current, total, false);

  const mine = jev_dice.length;
  const state = {
    game: "Liar's Dice, heads-up, between you and one opponent. Each player rolls their dice secretly under a cup.",
    rules: RULES,
    goal: 'Win the match by making the opponent lose all their dice before you lose yours.',
    your_dice: jev_dice.join(', '),
    dice_count: `You have ${mine} ${diceWord(mine)}. The opponent has ${opp_dice_count} hidden ${diceWord(opp_dice_count)}. ${total} dice in total.`,
    bids_this_round: bids.length
      ? bids.map((b, i) => `${i + 1}. ${who(b.by)} bid ${bidText(b.qty, b.face)}.`)
      : ['No bids yet: you open this round.'],
    current_bid: current
      ? `The opponent's bid of ${shortBid(current)} (${bidText(current.qty, current.face)}) stands. You must raise it or call Liar.`
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
      ? `Call Liar on the opponent's bid of ${shortBid(current)} (${bidText(current.qty, current.face)}).`
      : `Bid ${bidText(o.qty, o.face)}.`;
  }

  const questions = {
    action: {
      type: 'choice',
      instructions: current
        ? 'Raise the bid or call Liar? Pick the action that best protects your dice and wins the match.'
        : 'Which opening bid should you make? Pick the action that best protects your dice and wins the match.',
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

export default {
  schema: HINTED_SCHEMA,
  build: buildHinted,
  raw: { schema: RAW_SCHEMA, build: buildRaw },
};
