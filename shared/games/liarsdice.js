// Liar's Dice (heads-up) — Jev plays one side.
// All probability work happens in the browser (js/games/liarsdice-core.js); Jev only sees
// its own dice, the bidding so far and a likelihood *word* for every candidate action.
import { S, SchemaError } from '../schema.js';

const LIKELIHOOD = S.enumv('certain', 'very_likely', 'likely', 'coin_flip', 'unlikely', 'very_unlikely', 'impossible');
const OPTION_IDS = ['challenge', ...Array.from({ length: 10 }, (_, i) => `b${i}`)];
const QTY = S.int(1, 10);
const FACE = S.int(2, 6); // 1s are wild and cannot be bid

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

const bidText = (qty, face) => `at least ${qty} ${qty === 1 ? 'die' : 'dice'} showing ${FACE_NAME[face]}`;
const matchText = (n) => (n === 0 ? 'none of them yourself' : n === 1 ? 'one of them yourself' : `${n} of them yourself`);

export default {
  schema: S.obj({
    jev_dice: S.list(S.int(1, 6), 5),
    opp_dice_count: S.int(1, 5),
    current_bid: S.optional(S.obj({ qty: QTY, face: FACE, likelihood: LIKELIHOOD })),
    history: S.list(S.obj({ by: S.enumv('jev', 'opp'), qty: QTY, face: FACE }), 12),
    opp_style: S.enumv('unknown', 'honest', 'bluffs_sometimes', 'bluffs_often'),
    options: S.list(S.obj({
      id: S.enumv(OPTION_IDS),
      qty: S.optional(QTY),
      face: S.optional(FACE),
      likelihood: S.optional(LIKELIHOOD),
    }), 11),
  }),

  build({ jev_dice, opp_dice_count, current_bid, history, opp_style, options }) {
    // Consistency checks the flat schema cannot express.
    if (jev_dice.length < 1) throw new SchemaError('payload.jev_dice: empty');
    if (!options.length) throw new SchemaError('payload.options: empty');
    const ids = new Set();
    for (const o of options) {
      if (ids.has(o.id)) throw new SchemaError('payload.options: duplicate id');
      ids.add(o.id);
      if (o.id === 'challenge') {
        if (!current_bid) throw new SchemaError('payload.options: challenge without a bid');
      } else if (o.qty === undefined || o.face === undefined || o.likelihood === undefined) {
        throw new SchemaError('payload.options: bid option incomplete');
      }
    }

    const mine = jev_dice.length;
    const count = (face) => jev_dice.filter((d) => d === face || d === 1).length;
    const wilds = jev_dice.filter((d) => d === 1).length;

    const state = {
      game: "Liar's Dice, heads-up, between you and one opponent. Each player rolls their dice secretly under a cup.",
      rules: [
        "A bid claims that, across BOTH players' dice combined, at least a certain number of dice show a certain face.",
        '1s are wild: they count as every face. Nobody bids on 1s.',
        'Each new bid must be higher: more dice, or the same number of dice with a higher face.',
        "Instead of bidding you may call Liar on the opponent's bid. All dice are revealed. If the bid is true the caller loses a die; if false the bidder loses a die.",
        'A player with no dice left loses the match.',
      ],
      goal: 'Win the match: lose dice as rarely as possible. Bid what is probably true, occasionally bluff, and call Liar when the opponent overreaches.',
      your_dice: `${jev_dice.join(', ')}${wilds ? ` (the ${wilds === 1 ? '1 is' : `${wilds} ones are`} wild)` : ''}`,
      dice_left: `You have ${mine} ${mine === 1 ? 'die' : 'dice'}; the opponent has ${opp_dice_count} hidden ${opp_dice_count === 1 ? 'die' : 'dice'}.`,
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
  },
};
