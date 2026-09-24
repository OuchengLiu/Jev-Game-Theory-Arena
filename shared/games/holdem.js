// Heads-up Limit Texas Hold'em — Jev plays one seat.
// All maths (hand class, draws, Monte-Carlo equity, pot odds, opponent stats) is done in
// the browser; the payload only carries semantic buckets, which we turn into plain English.
import { S, CARDS, cardName, SchemaError } from '../schema.js';

const STREET = S.enumv('preflop', 'flop', 'turn', 'river');
const ACT = S.enumv('fold', 'check', 'call', 'bet', 'raise');
const CARD = S.enumv(CARDS);

const HAND_TEXT = {
  // preflop
  pocket_pair_high: 'A high pocket pair (tens or better)',
  pocket_pair_mid: 'A medium pocket pair (sixes to nines)',
  pocket_pair_low: 'A low pocket pair (twos to fives)',
  two_broadway: 'Two high cards, both ten or higher',
  ace_suited: 'An ace with a smaller card of the same suit',
  ace_offsuit: 'An ace with a smaller card of a different suit',
  suited_connector: 'Two close-in-rank cards of the same suit',
  suited: 'Two unconnected cards of the same suit',
  connector: 'Two consecutive cards of different suits',
  weak: 'Two low, unconnected, unsuited cards (a weak starting hand)',
  // postflop
  high_card: 'No pair: only high cards',
  board_plays: 'Your best five cards are all on the board; your hole cards do not help (at best a split pot)',
  pair_low: 'A low pair (below the top cards on the board)',
  pair_middle: 'A middle pair (not the highest board card)',
  top_pair_weak_kicker: 'Top pair (paired the highest board card) with a weak kicker',
  top_pair_good_kicker: 'Top pair (paired the highest board card) with a good kicker',
  overpair: 'An overpair (pocket pair higher than every board card)',
  two_pair: 'Two pair, using both of your hole cards',
  set: 'A set (three of a kind using your pocket pair)',
  trips: 'Three of a kind (trips)',
  straight: 'A straight',
  flush: 'A flush',
  full_house: 'A full house',
  quads: 'Four of a kind',
  straight_flush: 'A straight flush',
};
const HAND_KINDS = Object.keys(HAND_TEXT);
const PREFLOP_KINDS = HAND_KINDS.slice(0, 10);

const DRAW_TEXT = {
  none: 'No draw',
  gutshot: 'Gutshot straight draw (only one card rank completes a straight)',
  open_ended: 'Open-ended straight draw (two card ranks complete a straight)',
  flush_draw: 'Flush draw (one more card of your suit makes a flush)',
  combo_draw: 'Combo draw (both a flush draw and a straight draw)',
};

const EQUITY_TEXT = {
  very_weak: 'Very weak: wins less than 3 in 10 against a random hand',
  weak: 'Weak: wins about 3 to 4 in 10 against a random hand',
  marginal: 'Marginal: wins a bit less than half the time against a random hand',
  decent: 'Decent: wins a bit more than half the time against a random hand',
  strong: 'Strong: wins about 6 to 7 in 10 against a random hand',
  very_strong: 'Very strong: wins about 8 in 10 against a random hand',
  monster: 'Monster: wins almost always (well over 8 in 10) against a random hand',
};

const POT_ODDS_TEXT = {
  none: 'Nothing to call right now.',
  great: 'Great price: calling needs to win less than 1 time in 5 to break even.',
  good: 'Good price: calling needs to win about 1 time in 4 to break even.',
  fair: 'Fair price: calling needs to win about 1 time in 3 to break even.',
  poor: 'Poor price: calling needs to win more than 1 time in 3 to break even.',
};

const AGGR_TEXT = {
  unknown: 'Not enough hands seen yet.',
  passive: 'Passive: mostly checks and calls, rarely bets or raises (their bets usually mean a real hand).',
  balanced: 'Balanced: bets and raises a normal amount.',
  aggressive: 'Aggressive: bets and raises often (bets are less reliable).',
  very_aggressive: 'Very aggressive: bets and raises most of the time, including many bluffs.',
};
const FOLD_TEXT = {
  unknown: 'Not enough hands seen yet.',
  rarely: 'Rarely folds when bet into (bluffs seldom work; value bets get paid).',
  sometimes: 'Sometimes folds when bet into.',
  often: 'Often folds when bet into (bluffs work well).',
};
const STACK_TEXT = {
  deep: 'Deep: plenty of chips behind for many hands.',
  medium: 'Medium: a comfortable number of chips behind.',
  short: 'Short: one of you could go broke within a few big pots.',
  very_short: 'Very short: one of you could go broke in this hand.',
};
const POT_TEXT = {
  small: 'Small (only the blinds or a little more).',
  medium: 'Medium.',
  large: 'Large: many bets have gone in.',
  huge: 'Huge: this hand matters a lot for the match.',
};
const CHIPS_TEXT = {
  well_ahead: 'You are far ahead in chips for the match.',
  ahead: 'You are ahead in chips for the match.',
  even: 'Chips are about even.',
  behind: 'You are behind in chips for the match.',
  well_behind: 'You are far behind in chips for the match.',
};
const STREET_TEXT = {
  preflop: 'Preflop: no community cards yet; flop, turn and river still to come.',
  flop: 'Flop: 3 community cards are showing; turn and river still to come.',
  turn: 'Turn: 4 community cards are showing; only the river is still to come.',
  river: 'River: all 5 community cards are showing; no more cards to come.',
};

const e = (obj) => S.enumv(Object.keys(obj));

const schema = S.obj({
  street: STREET,
  hole: S.list(CARD, 2),
  board: S.list(CARD, 5),
  hand: S.enumv(HAND_KINDS),
  draw: e(DRAW_TEXT),
  equity: e(EQUITY_TEXT),
  pot_odds: e(POT_ODDS_TEXT),
  position: S.enumv('button', 'big_blind'),
  history: S.list(S.obj({ street: STREET, actor: S.enumv('jev', 'opp'), act: ACT }), 24),
  opp_aggression: e(AGGR_TEXT),
  opp_fold_to_bet: e(FOLD_TEXT),
  stack: e(STACK_TEXT),
  pot: e(POT_TEXT),
  chips: e(CHIPS_TEXT),
  legal: S.list(ACT, 5),
});

const BOARD_LEN = { preflop: 0, flop: 3, turn: 4, river: 5 };
const LEGAL_SETS = ['check', 'check,bet', 'check,raise', 'fold,call', 'fold,call,raise'];
const ORDER = ['fold', 'check', 'call', 'bet', 'raise'];

// Structural checks the flat schema cannot express.
function validate(p) {
  const bad = (m) => { throw new SchemaError(`payload: ${m}`); };
  if (p.hole.length !== 2) bad('hole must have 2 cards');
  if (p.board.length !== BOARD_LEN[p.street]) bad('board size does not match street');
  if (new Set([...p.hole, ...p.board]).size !== p.hole.length + p.board.length) bad('duplicate cards');
  const legal = [...p.legal].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  if (!LEGAL_SETS.includes(legal.join(','))) bad('inconsistent legal actions');
  if ((p.street === 'preflop') !== PREFLOP_KINDS.includes(p.hand)) bad('hand kind does not match street');
  if (p.pot_odds === 'none' ? legal.includes('call') : !legal.includes('call')) bad('pot odds do not match legal actions');
  return legal;
}

function describeHistory(history) {
  const who = (a) => (a === 'jev' ? 'you' : 'opponent');
  const verb = { check: 'checked', bet: 'bet', call: 'called', raise: 'raised', fold: 'folded' };
  const out = [];
  for (const st of ['preflop', 'flop', 'turn', 'river']) {
    const acts = history.filter((x) => x.street === st);
    if (acts.length) out.push(`${st[0].toUpperCase()}${st.slice(1)}: ${acts.map((x) => `${who(x.actor)} ${verb[x.act]}`).join(', ')}`);
  }
  return out.length ? out : ['No voluntary actions yet this hand (only the blinds are in).'];
}

function situation(p, legal) {
  const cur = p.history.filter((x) => x.street === p.street);
  const raises = cur.filter((x) => x.act === 'bet' || x.act === 'raise').length + (p.street === 'preflop' ? 1 : 0);
  const lastRaise = raises >= 3 ? ' Only one more raise is allowed on this street (the cap is 4 bets).' : '';
  const last = cur[cur.length - 1];
  if (legal.includes('call')) {
    if (p.street === 'preflop' && !cur.length) return 'You are the small blind; you must fold, complete the big blind by calling, or raise.' + lastRaise;
    const what = last && last.act === 'raise' ? 'raised' : 'bet';
    return `The opponent has ${what}. You must fold, call, or ${legal.includes('raise') ? 're-raise' : '(betting is capped) call'}.${legal.includes('raise') ? lastRaise : ''}`;
  }
  if (p.street === 'preflop') return 'The small blind only called; you are the big blind and can check or raise.';
  if (last && last.act === 'check') return 'The opponent checked to you.';
  return 'You act first on this street.';
}

function build(p) {
  const legal = validate(p);
  const unit = p.street === 'preflop' || p.street === 'flop' ? 'one small bet (2 chips)' : 'one big bet (4 chips)';
  const inPos = p.position === 'button';

  const state = {
    game: "Heads-up Limit Texas Hold'em: you against one opponent, many hands in a row. Blinds 1 and 2. Every bet or raise is a fixed size: 2 chips preflop and on the flop, 4 chips on the turn and river. At most 4 bets per street.",
    goal: "Win as many of the opponent's chips as possible; the match ends when one player has none left.",
    street: STREET_TEXT[p.street],
    your_cards: p.hole.map(cardName),
    board: p.board.length ? p.board.map(cardName) : 'none yet',
    your_hand: HAND_TEXT[p.hand],
    your_draw: DRAW_TEXT[p.draw],
    hand_strength: EQUITY_TEXT[p.equity],
    position: inPos
      ? 'You are on the button: you act first before the flop but LAST on the flop, turn and river (an advantage).'
      : 'You are the big blind: you act last before the flop but FIRST on the flop, turn and river (a disadvantage).',
    situation: situation(p, legal),
    price_to_call: POT_ODDS_TEXT[p.pot_odds],
    pot: POT_TEXT[p.pot],
    stacks: STACK_TEXT[p.stack],
    match_score: CHIPS_TEXT[p.chips],
    actions_this_hand: describeHistory(p.history),
    opponent_style: AGGR_TEXT[p.opp_aggression],
    opponent_vs_bets: FOLD_TEXT[p.opp_fold_to_bet],
  };

  const CRIT = {
    fold: 'Fold: give up this hand and the chips already in the pot. Right when your hand is unlikely to win and the price to continue is not worth it.',
    check: 'Check: put in no chips and pass the action. Right with a medium hand to keep the pot small, with a weak hand that does not want to bluff, or to trap with a very strong hand.',
    call: 'Call: match the opponent\'s bet to stay in the hand. Right when your chance of winning is good enough for the price, or to catch a likely bluff.',
    bet: `Bet ${unit}. Right for value when your hand is likely best, or as a bluff or semi-bluff when the opponent may fold or you have a strong draw.`,
    raise: `Raise by ${unit}. Right for value when your hand is likely ahead of the opponent's, or as a bluff or semi-bluff to make the opponent fold.`,
  };

  return {
    state,
    questions: {
      action: {
        type: 'choice',
        instructions: 'Which action should you take now to win the most chips over the long run? You may mix: sometimes bluff, sometimes slow-play.',
        criteria: Object.fromEntries(legal.map((a) => [a, CRIT[a]])),
      },
      opp_bluffing: {
        type: 'noul',
        instructions: 'Is the opponent likely bluffing or semi-bluffing with a weaker hand than yours?',
      },
      ahead: {
        type: 'noul',
        instructions: "Does your hand currently beat the opponent's likely hand?",
      },
    },
  };
}

export default { schema, build };
