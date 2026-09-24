// Heads-up No-Limit Texas Hold'em — Jev plays one seat.
// Jev chooses among discrete sizes (so a Choice question works): fold / check / call, and
// preflop r2x / r3x / r4x (raise to 2, 3 or 4 times the bet faced), postflop b33 / b50 / b75 /
// b100 / b200 (bet that fraction of the pot, or raise by that fraction of the pot after calling),
// and allin. The browser only sends sizes that are legal and distinct after clamping.
//
// Clean ablation (see shared/prompts.js):
//   raw    = base(): rules, neutral goal, the hand number, street, own hole cards, board,
//            dealer button, pot, both stacks, this round's bets, every action of this hand
//            with amounts, the last few finished hands and the literal options with amounts.
//   hinted = the identical base + `state.analysis` (hand category, draw, Monte-Carlo equity
//            bucket, pot odds, effective stack / SPR / pot / chip-lead buckets, bet-size words,
//            opponent profile) + an " Analysis: …" suffix on call and on each size option
//            (price to call; size in big blinds / fraction of the pot).
//   All maths is done in the browser (js/games/holdem-core.js); the hinted payload is the
//   raw record + those analysis fields (enums only).
import { S, CARDS, cardName, SchemaError } from '../schema.js';

const STREET = S.enumv('preflop', 'flop', 'turn', 'river');
const ACT = S.enumv('fold', 'check', 'call', 'bet', 'raise');
const BASIC = S.enumv('fold', 'check', 'call');
const CARD = S.enumv(CARDS);
const MAX_CHIPS = 400; // both 200-chip stacks
const CHIPS = S.int(0, MAX_CHIPS);
const POS_CHIPS = S.int(1, MAX_CHIPS);

const PREFLOP_IDS = ['r2x', 'r3x', 'r4x', 'allin'];
const POSTFLOP_IDS = ['b33', 'b50', 'b75', 'b100', 'b200', 'allin'];
const SIZE_ID = S.enumv([...new Set([...PREFLOP_IDS, ...POSTFLOP_IDS])]);
const SIZE_WORD = S.enumv('small', 'medium', 'large', 'overbet', 'allin');
const FRAC_TEXT = {
  tiny: 'less than a quarter of the pot',
  third: 'about 1/3 of the pot',
  half: 'about half the pot',
  three_quarters: 'about 3/4 of the pot',
  pot: 'about the size of the pot',
  one_and_half: 'about 1.5 times the pot',
  double: 'about 2 times the pot',
  more: 'more than 2 times the pot',
};

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
  passive: 'Passive: mostly checks and calls, rarely bets or raises.',
  balanced: 'Balanced: bets and raises a normal amount.',
  aggressive: 'Aggressive: bets and raises often.',
  very_aggressive: 'Very aggressive: bets and raises most of the time.',
};
const FOLD_TEXT = {
  unknown: 'Not enough hands seen yet.',
  rarely: 'Rarely folds when bet into.',
  sometimes: 'Sometimes folds when bet into.',
  often: 'Often folds when bet into.',
};
const STACK_TEXT = {
  deep: 'Deep: 75 big blinds or more behind (effective stack).',
  medium: 'Medium: about 35 to 75 big blinds behind (effective stack).',
  short: 'Short: about 15 to 35 big blinds behind (effective stack).',
  very_short: 'Very short: under 15 big blinds behind (effective stack).',
};
const SPR_TEXT = {
  very_low: 'Very low: the chips left behind are less than the pot.',
  low: 'Low: about 1 to 2.5 pots left behind.',
  medium: 'Medium: about 2.5 to 6 pots left behind.',
  high: 'High: about 6 to 13 pots left behind.',
  very_high: 'Very high: 13 or more pots left behind; the pot is tiny compared with the stacks.',
};
const POT_TEXT = {
  small: 'Small: only the blinds or a little more.',
  medium: 'Medium.',
  large: 'Large: many chips have gone in.',
  huge: 'Huge: a large share of all chips is in the pot.',
};
const CHIPS_TEXT = {
  well_ahead: 'You are far ahead in chips for the match.',
  ahead: 'You are ahead in chips for the match.',
  even: 'Chips are about even.',
  behind: 'You are behind in chips for the match.',
  well_behind: 'You are far behind in chips for the match.',
};
const SIZE_TEXT = {
  small: 'small',
  medium: 'medium-sized',
  large: 'large',
  overbet: 'very large (overbet)',
  allin: 'all-in',
};

const e = (obj) => S.enumv(Object.keys(obj));

const BOARD_LEN = { preflop: 0, flop: 3, turn: 4, river: 5 };
const LEGAL_SETS = ['check', 'fold,call'];
const ORDER = ['fold', 'check', 'call'];

const unique = (xs) => new Set(xs).size === xs.length;

/** Invariants of the size options. Returns 'bet' | 'raise' | null. */
function checkOptions(p, legal, bad, callAmount, stack) {
  const opts = p.options;
  const allowed = p.street === 'preflop' ? PREFLOP_IDS : POSTFLOP_IDS;
  const ids = opts.map((o) => o.id);
  if (!unique(ids)) bad('duplicate options');
  if (ids.some((id) => !allowed.includes(id))) bad('option does not fit the street');
  if (opts.length && ids[ids.length - 1] !== 'allin') bad('allin must be the last option');
  for (let i = 1; i < opts.length; i++) {
    if (allowed.indexOf(ids[i]) <= allowed.indexOf(ids[i - 1])) bad('options out of order');
    if (opts[i].to <= opts[i - 1].to) bad('option sizes must increase');
  }
  if (opts.length) {
    const already = opts[0].to - opts[0].add;
    if (already < 0 || opts.some((o) => o.to - o.add !== already)) bad('inconsistent option amounts');
    if (opts.some((o) => o.add <= callAmount)) bad('a raise must put in more than a call');
    if (opts.some((o) => o.add > stack) || opts[opts.length - 1].add !== stack) bad('option amounts do not match the stack');
  }
  if (!opts.length) return null;
  return p.street !== 'preflop' && !legal.includes('call') ? 'bet' : 'raise';
}

const chips = (n) => `${n} chip${n === 1 ? '' : 's'}`;
const bbs = (n) => `${n / 2} big blind${n === 2 ? '' : 's'}`;
const cap = (x) => x[0].toUpperCase() + x.slice(1);
const cardList = (cs) => cs.map(cardName).join(', ');

// =====================================================================================
// Raw record (shared by both modes)
// =====================================================================================

const HAND_NAME_TEXT = {
  high_card: 'High card', pair: 'One pair', two_pair: 'Two pair', trips: 'Three of a kind',
  straight: 'Straight', flush: 'Flush', full_house: 'Full house', quads: 'Four of a kind',
  straight_flush: 'Straight flush', royal_flush: 'Royal flush',
};
const RAW_ACT = S.enumv('small_blind', 'big_blind', 'fold', 'check', 'call', 'bet', 'raise');
const WHO = S.enumv('jev', 'opp');

const PAST = S.obj({
  hand_no: S.int(1, 100000),
  winner: S.enumv('jev', 'opp', 'split'),
  pot: CHIPS,
  ended: S.enumv('fold', 'showdown'),
  street: STREET,
  jev_dealer: S.bool(),
  jev_hole: S.list(CARD, 2),
  board: S.list(CARD, 5),
  opp_hole: S.optional(S.list(CARD, 2)),
  jev_hand: S.optional(e(HAND_NAME_TEXT)),
  opp_hand: S.optional(e(HAND_NAME_TEXT)),
});

const RAW_OPTION = { id: SIZE_ID, to: POS_CHIPS, add: POS_CHIPS };
const RAW_FIELDS = {
  hand_no: S.int(1, 100000),
  street: STREET,
  hole: S.list(CARD, 2),
  board: S.list(CARD, 5),
  dealer: WHO,
  pot: CHIPS,
  jev_stack: CHIPS,
  opp_stack: CHIPS,
  jev_bet: CHIPS,
  opp_bet: CHIPS,
  actions: S.list(S.obj({ street: STREET, actor: WHO, act: RAW_ACT, amount: CHIPS, allin: S.bool() }), 32),
  legal: S.list(BASIC, 2),
  call_amount: CHIPS,
  recent: S.list(PAST, 6),
};
const RAW_SCHEMA = S.obj({ ...RAW_FIELDS, options: S.list(S.obj(RAW_OPTION), 6) });

// Hinted payload = the raw record + code-computed buckets (enums only).
const HINTED_SCHEMA = S.obj({
  ...RAW_FIELDS,
  options: S.list(S.obj({ ...RAW_OPTION, size: SIZE_WORD, frac: e(FRAC_TEXT) }), 6),
  hand: S.enumv(HAND_KINDS),
  draw: e(DRAW_TEXT),
  equity: e(EQUITY_TEXT),
  pot_odds: e(POT_ODDS_TEXT),
  opp_aggression: e(AGGR_TEXT),
  opp_fold_to_bet: e(FOLD_TEXT),
  stack: e(STACK_TEXT),
  spr: e(SPR_TEXT),
  pot_size: e(POT_TEXT),
  chip_lead: e(CHIPS_TEXT),
  action_sizes: S.list(S.obj({ street: STREET, actor: WHO, act: ACT, size: S.optional(SIZE_WORD) }), 24),
});

function validateRaw(p) {
  const bad = (m) => { throw new SchemaError(`payload: ${m}`); };
  if (p.hole.length !== 2) bad('hole must have 2 cards');
  if (p.board.length !== BOARD_LEN[p.street]) bad('board size does not match street');
  if (!unique([...p.hole, ...p.board])) bad('duplicate cards');
  const legal = [...p.legal].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  if (!LEGAL_SETS.includes(legal.join(','))) bad('inconsistent legal actions');
  if (legal.includes('call') !== p.call_amount > 0) bad('call amount does not match legal actions');
  if (p.call_amount > p.jev_stack) bad('call amount exceeds the stack');
  if (p.jev_stack + p.opp_stack + p.pot > MAX_CHIPS) bad('too many chips');
  if (p.jev_bet + p.opp_bet > p.pot) bad('bets exceed the pot');
  const kind = checkOptions(p, legal, bad, p.call_amount, p.jev_stack);
  if (p.options.length && p.options[0].to - p.options[0].add !== p.jev_bet) bad('option amounts do not match your bet');
  for (const r of p.recent) {
    if (r.jev_hole.length !== 2) bad('recent: hole must have 2 cards');
    if (r.ended === 'showdown') {
      if (r.board.length !== 5 || r.opp_hole?.length !== 2 || !r.jev_hand || !r.opp_hand) bad('recent: incomplete showdown');
    } else if (r.winner === 'split' || r.opp_hole || r.jev_hand || r.opp_hand || r.board.length !== BOARD_LEN[r.street]) {
      bad('recent: inconsistent fold');
    }
    if (!unique([...r.jev_hole, ...(r.opp_hole || []), ...r.board])) bad('recent: duplicate cards');
  }
  return { legal, kind };
}

const RAW_STREET = {
  preflop: 'Preflop (no community cards yet)',
  flop: 'Flop (3 community cards)',
  turn: 'Turn (4 community cards)',
  river: 'River (all 5 community cards; the last betting round)',
};
const STREET_NAME = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' };

function actionPhrase(x) {
  const you = x.actor === 'jev';
  const s = (verb, plural) => (you ? `You ${verb}` : `Opponent ${plural || `${verb}s`}`);
  const allin = x.allin ? ' (all-in)' : '';
  switch (x.act) {
    case 'small_blind': return `${s('post')} the small blind of ${x.amount}${allin}`;
    case 'big_blind': return `${s('post')} the big blind of ${x.amount}${allin}`;
    case 'fold': return s('fold');
    case 'check': return s('check');
    case 'call': return `${s('call')} ${x.amount}${allin}`;
    case 'bet': return `${s('bet')} ${x.amount}${allin}`;
    default: return `${s('raise')} to ${x.amount}${allin}`;
  }
}

function rawHistory(actions) {
  const out = [];
  for (const st of ['preflop', 'flop', 'turn', 'river']) {
    const acts = actions.filter((x) => x.street === st);
    if (acts.length) out.push(`${STREET_NAME[st]}: ${acts.map(actionPhrase).join('; ')}`);
  }
  return out.length ? out : ['No actions yet this hand.'];
}

function recentLine(r) {
  const where = r.street === 'preflop' ? 'before the flop' : `on the ${r.street}`;
  let head;
  if (r.winner === 'split') head = `split a ${r.pot}-chip pot at showdown`;
  else {
    const winner = r.winner === 'jev' ? 'You' : 'Opponent';
    const net = r.pot / 2;
    head = r.ended === 'showdown'
      ? `${winner} won a ${r.pot}-chip pot at showdown (${net} chips from the loser)`
      : `${winner} won a ${r.pot}-chip pot (${net} chips from the loser) because ${r.winner === 'jev' ? 'the opponent' : 'you'} folded ${where}`;
  }
  const parts = [`Hand ${r.hand_no}: ${cap(head)}.`];
  parts.push(`Dealer: ${r.jev_dealer ? 'you' : 'opponent'}.`);
  parts.push(`Your cards: ${cardList(r.jev_hole)}${r.jev_hand ? ` (${HAND_NAME_TEXT[r.jev_hand]})` : ''}.`);
  if (r.opp_hole) parts.push(`Opponent showed: ${cardList(r.opp_hole)} (${HAND_NAME_TEXT[r.opp_hand]}).`);
  else if (r.ended === 'fold') parts.push('Opponent cards: not shown.');
  parts.push(`Board: ${r.board.length ? cardList(r.board) : 'none dealt'}.`);
  return parts.join(' ');
}

const QUESTIONS_TAIL = {
  opp_bluffing: {
    type: 'noul',
    instructions: 'Is the opponent likely bluffing or semi-bluffing with a weaker hand than yours?',
  },
  ahead: {
    type: 'noul',
    instructions: "Does your hand currently beat the opponent's likely hand?",
  },
};

/** Shared base: rules, neutral goal, the situation, the full record, literal options. */
function base(p, checked = validateRaw(p)) {
  const { legal, kind } = checked;
  const allinCall = p.call_amount >= p.jev_stack ? ' (all of your remaining chips)' : '';
  const CRIT = {
    fold: 'Fold: give up the pot. The chips you have already put in stay in the pot.',
    check: 'Check: put in no chips.',
    call: `Call ${chips(p.call_amount)}: put in ${chips(p.call_amount)} to match the opponent${allinCall}.`,
  };
  const criteria = Object.fromEntries(legal.map((a) => [a, CRIT[a]]));
  for (const o of p.options) {
    const verb = kind === 'bet' ? `Bet ${chips(o.to)}` : `Raise to ${chips(o.to)} this betting round`;
    const tail = o.id === 'allin' ? ' (all of your remaining chips: all-in)' : '';
    criteria[o.id] = `${verb}: put in ${chips(o.add)}${kind === 'bet' ? '' : ' more'}${tail}.`;
  }
  const state = {
    game: "Heads-up No-Limit Texas Hold'em: you against one opponent, many hands in a row. Both players started the match with 200 chips. Blinds 1 and 2. A bet must be at least 2 chips; a raise must increase the bet by at least the previous bet or raise; a bet or raise may go up to all of your chips (chips the opponent cannot match are returned). If a player is all-in and called, the remaining cards are dealt with no more betting. Best five of seven cards wins at showdown.",
    goal: "Win as many of the opponent's chips as possible; the match ends when one player has none left.",
    hand: `Hand ${p.hand_no} of the match.`,
    street: RAW_STREET[p.street],
    your_cards: p.hole.map(cardName),
    board: p.board.length ? p.board.map(cardName) : 'none yet',
    dealer: p.dealer === 'jev'
      ? 'You have the dealer button: you posted the small blind, you act first before the flop and last on the flop, turn and river.'
      : 'The opponent has the dealer button: they posted the small blind and you posted the big blind; you act last before the flop and first on the flop, turn and river.',
    pot: chips(p.pot),
    your_stack: `${chips(p.jev_stack)} behind`,
    opponent_stack: `${chips(p.opp_stack)} behind`,
    this_betting_round: `Chips put in during this betting round: you ${p.jev_bet}, opponent ${p.opp_bet}.`,
    actions_this_hand: rawHistory(p.actions),
    recent_hands: p.recent.length ? p.recent.slice().reverse().map(recentLine) : ['No earlier hands yet.'],
  };
  return {
    state,
    questions: {
      action: {
        type: 'choice',
        instructions: 'Which action do you take now?',
        criteria,
      },
      ...QUESTIONS_TAIL,
    },
  };
}

// =====================================================================================
// Hinted: base + analysis
// =====================================================================================

function describeSizes(history) {
  const who = (a) => (a === 'jev' ? 'you' : 'opponent');
  const verb = (x) => {
    if (x.size === 'allin') return 'went all-in';
    const w = { check: 'checked', bet: 'bet', call: 'called', raise: 'raised', fold: 'folded' }[x.act];
    return x.size ? `${w} (${SIZE_TEXT[x.size]})` : w;
  };
  const out = [];
  for (const st of ['preflop', 'flop', 'turn', 'river']) {
    const acts = history.filter((x) => x.street === st);
    if (acts.length) out.push(`${STREET_NAME[st]}: ${acts.map((x) => `${who(x.actor)} ${verb(x)}`).join(', ')}`);
  }
  return out.length ? out : ['No voluntary actions yet this hand (only the blinds are in).'];
}

function sizeAnalysis(o, p, kind) {
  const word = SIZE_TEXT[o.size];
  if (o.id === 'allin') return `an all-in ${kind}; ${FRAC_TEXT[o.frac]}.`;
  if (p.street === 'preflop') return `${bbs(o.to)} in total; a ${word} raise.`;
  if (kind === 'bet') return `${FRAC_TEXT[o.frac]}; a ${word} bet.`;
  return `after matching the bet, this raises by ${FRAC_TEXT[o.frac]}; a ${word} raise.`;
}

const RAW_KEYS = Object.keys(RAW_FIELDS);

function hinted(p) {
  const bad = (m) => { throw new SchemaError(`payload: ${m}`); };
  const raw = Object.fromEntries(RAW_KEYS.map((k) => [k, p[k]]));
  raw.options = p.options.map(({ id, to, add }) => ({ id, to, add }));
  const checked = validateRaw(raw);
  const { legal, kind } = checked;
  if ((p.street === 'preflop') !== PREFLOP_KINDS.includes(p.hand)) bad('hand kind does not match street');
  if (p.pot_odds === 'none' ? legal.includes('call') : !legal.includes('call')) bad('pot odds do not match legal actions');
  if (p.options.some((o) => (o.id === 'allin') !== (o.size === 'allin'))) bad('size word does not match option');

  const req = base(raw, checked);
  req.state.analysis = {
    your_hand: HAND_TEXT[p.hand],
    your_draw: DRAW_TEXT[p.draw],
    hand_strength: EQUITY_TEXT[p.equity],
    price_to_call: POT_ODDS_TEXT[p.pot_odds],
    effective_stack: STACK_TEXT[p.stack],
    stack_to_pot: SPR_TEXT[p.spr],
    pot_size: POT_TEXT[p.pot_size],
    match_score: CHIPS_TEXT[p.chip_lead],
    bet_sizes_this_hand: describeSizes(p.action_sizes),
    opponent_style: AGGR_TEXT[p.opp_aggression],
    opponent_vs_bets: FOLD_TEXT[p.opp_fold_to_bet],
  };
  const crit = req.questions.action.criteria;
  if (crit.call) crit.call += ` Analysis: ${POT_ODDS_TEXT[p.pot_odds]}`;
  for (const o of p.options) crit[o.id] += ` Analysis: ${sizeAnalysis(o, p, kind)}`;
  return req;
}

export default { schema: HINTED_SCHEMA, build: hinted, raw: { schema: RAW_SCHEMA, build: base } };
