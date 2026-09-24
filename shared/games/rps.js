// Rock-Paper-Scissors, "predict the human". Jev never picks its own throw:
// it only predicts the human's next throw; code turns that into a counter-strategy.
//
// Clean ablation (see shared/prompts.js): base() builds the Raw request from the record;
// Hinted = that identical base + `state.analysis` (pattern mining done here in code:
// favourite throw, win-stay / lose-shift habits, sequences, clues) + an " Analysis: …"
// suffix on each throw saying which clues point to it. Both modes take the same payload.
import { S, SchemaError } from '../schema.js';

export const THROWS = ['rock', 'paper', 'scissors'];
/** COUNTER[x] is the throw that beats x. */
export const COUNTER = { rock: 'paper', paper: 'scissors', scissors: 'rock' };
/** Outcome of one round from the human's point of view. */
export const outcomeOf = (human, jev) => (human === jev ? 'draw' : COUNTER[jev] === human ? 'human_won' : 'jev_won');

const THROW = S.enumv(THROWS);
const OUTCOME = S.enumv('human_won', 'jev_won', 'draw');

// How the human's throw relates to their own previous throw.
//  stay: same throw again · up: the throw that beats their previous one · down: the throw their previous one beats
const relOf = (prev, next) => (next === prev ? 'stay' : next === COUNTER[prev] ? 'up' : 'down');
export const applyRel = (prev, rel) => (rel === 'stay' ? prev : rel === 'up' ? COUNTER[prev] : COUNTER[COUNTER[prev]]);
const REL_WORDS = {
  stay: 'stays with the same throw',
  up: 'switches to the throw that would have beaten their previous throw',
  down: 'switches to the throw that their previous throw would have beaten',
};
export const COND = { human_won: 'won', jev_won: 'lost', draw: 'draw' }; // human perspective

function dominant(counts, minN, minShare) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total < minN) return { key: null, share: 0, total };
  const [key, c] = Object.entries(counts).reduce((a, b) => (b[1] > a[1] ? b : a));
  const share = c / total;
  return { key: share >= minShare ? key : null, share, total };
}

/** Pure pattern analysis of the human's play (shared by the prompt and the built-in bot). */
export function analyze(history) {
  const n = history.length;
  const counts = { rock: 0, paper: 0, scissors: 0 };
  history.forEach((r) => { counts[r.human] += 1; });

  const fav = dominant(counts, 4, 0.45);
  const favoriteStrength = !fav.key ? 'none' : fav.share >= 0.55 ? 'strong' : 'slight';

  // Habits after each outcome, and first-order sequence (after throw X, next is Y).
  const habitCounts = { won: { stay: 0, up: 0, down: 0 }, lost: { stay: 0, up: 0, down: 0 }, draw: { stay: 0, up: 0, down: 0 } };
  const overallRel = { stay: 0, up: 0, down: 0 };
  const seq = Object.fromEntries(THROWS.map((x) => [x, { rock: 0, paper: 0, scissors: 0 }]));
  for (let i = 1; i < n; i++) {
    const prev = history[i - 1];
    const rel = relOf(prev.human, history[i].human);
    habitCounts[COND[prev.outcome]][rel] += 1;
    overallRel[rel] += 1;
    seq[prev.human][history[i].human] += 1;
  }
  const habits = Object.fromEntries(Object.entries(habitCounts).map(([k, c]) => [k, dominant(c, 2, 0.6)]));
  const overall = dominant(overallRel, 4, 0.5);

  const last = history[n - 1];
  const suggestions = { habit: null, sequence: null, frequency: fav.key, overall: null };
  if (last) {
    const hb = habits[COND[last.outcome]];
    if (hb.key) suggestions.habit = applyRel(last.human, hb.key);
    const sq = dominant(seq[last.human], 2, 0.6);
    if (sq.key) suggestions.sequence = sq.key;
    if (overall.key) suggestions.overall = applyRel(last.human, overall.key);
  }
  return { n, counts, favorite: fav.key, favoriteStrength, habits, habitCounts, overall, last, suggestions, seq };
}

function habitWords(hb) {
  if (hb.total < 2) return 'not enough data yet';
  if (!hb.key) return 'no clear habit';
  return `${hb.share >= 0.8 ? 'almost always' : 'usually'} ${REL_WORDS[hb.key]}`;
}

const SCHEMA = S.obj({
  round: S.int(1, 20),
  total: S.int(1, 20),
  history: S.list(S.obj({ human: THROW, jev: THROW, outcome: OUTCOME }), 20),
});

/** Shared base: rules, neutral goal, round, score, full record, literal options. */
function base({ round, total, history }) {
  if (round > total || round !== history.length + 1) throw new SchemaError('payload.round: inconsistent with history');
  const score = { opponent_round_wins: 0, your_round_wins: 0, draws: 0 };
  const words = { human_won: 'the opponent won', jev_won: 'you won', draw: 'draw' };
  const rounds = history.map((r, i) => {
    if (outcomeOf(r.human, r.jev) !== r.outcome) throw new SchemaError(`payload.history[${i}].outcome: inconsistent`);
    score[r.outcome === 'human_won' ? 'opponent_round_wins' : r.outcome === 'jev_won' ? 'your_round_wins' : 'draws'] += 1;
    return `Round ${i + 1}: opponent threw ${r.human}, you threw ${r.jev}; ${words[r.outcome]}.`;
  });
  return {
    state: {
      game: 'Rock-paper-scissors against a human opponent. Rock beats scissors, scissors beats paper, paper beats rock; the same throw is a draw. Both players throw at the same time.',
      goal: "Predict the opponent's next throw. Your prediction is used to pick your counter-throw.",
      round: `Round ${round} of ${total}.`,
      score,
      history: rounds.length ? rounds : ['No rounds played yet.'],
    },
    questions: {
      predict: {
        type: 'choice',
        instructions: 'Which throw will the opponent play next round?',
        criteria: Object.fromEntries(THROWS.map((x) => [x, `The opponent throws ${x} next round.`])),
      },
      patterned: {
        type: 'noul',
        instructions: "Does the opponent's play follow a pattern that could be exploited, rather than looking random?",
      },
    },
  };
}

function hinted(p) {
  const req = base(p);
  const a = analyze(p.history);
  const s = a.suggestions;
  const clues = [];
  const pointers = Object.fromEntries(THROWS.map((x) => [x, []]));
  const add = (x, text, short) => { if (x) { clues.push(`${text}: ${x}`); pointers[x].push(short); } };
  add(s.habit, 'Their habit after the last result points to', 'their habit after the last result');
  if (s.sequence) add(s.sequence, `After throwing ${a.last.human}, they most often throw next`, `their usual throw after ${a.last.human}`);
  if (s.overall !== s.habit) add(s.overall, 'Their general switching style points to', 'their general switching style');
  add(s.frequency, 'Their favourite throw overall is', 'their favourite throw overall');

  const favWords = a.n < 4 ? 'not enough data yet'
    : a.favoriteStrength === 'strong' ? `${a.favorite} (strongly favoured)`
    : a.favoriteStrength === 'slight' ? `${a.favorite} (slightly favoured)`
    : 'no favourite; throws are fairly balanced';

  req.state.analysis = {
    throw_counts: a.counts,
    opponent_favourite_throw: favWords,
    habit_after_opponent_wins: habitWords(a.habits.won),
    habit_after_opponent_loses: habitWords(a.habits.lost),
    habit_after_draw: habitWords(a.habits.draw),
    clues_for_next_throw: clues.length ? clues : ['No clue found yet; the play so far shows no detected pattern.'],
  };
  const crit = req.questions.predict.criteria;
  for (const x of THROWS) {
    const list = pointers[x];
    crit[x] += ` Analysis: ${list.length ? `pointed to by ${list.join(' and by ')}` : 'no clue points to this throw'}.`;
  }
  return req;
}

export default {
  schema: SCHEMA,
  build: hinted,
  raw: { schema: SCHEMA, build: base },
};
