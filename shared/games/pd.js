// Iterated Prisoner's Dilemma — Jev plays one side.
//
// Clean ablation (see shared/prompts.js): base() builds the Raw request from the record;
// the Hinted request is that identical base plus one `state.analysis` object with the
// code-computed facts (opponent tendency bucket, rounds remaining). No option carries an
// analysis suffix here: nothing is computed per option. Both modes take the same payload.
import { S, SchemaError } from '../schema.js';

const MOVE = S.enumv('C', 'D');
/** Payoffs [jev, opp] keyed by jev move + opp move. */
export const PAYOFF = { CC: [3, 3], CD: [0, 5], DC: [5, 0], DD: [1, 1] };

const SCHEMA = S.obj({
  round: S.int(1, 50),
  total: S.int(1, 50),
  history: S.list(S.obj({ jev: MOVE, opp: MOVE }), 50),
});

const PAYOFF_WORDS = {
  both_cooperate: 'each gets 3 points',
  both_defect: 'each gets 1 point',
  you_defect_they_cooperate: 'you get 5, they get 0',
  you_cooperate_they_defect: 'you get 0, they get 5',
};

const word = (m) => (m === 'C' ? 'cooperated' : 'defected');

/** Shared base: rules, neutral goal, round, score, full record, literal options. */
function base({ round, total, history }) {
  if (round > total || round !== history.length + 1) throw new SchemaError('payload.round: inconsistent with history');
  let you = 0;
  let opp = 0;
  const rounds = history.map((h, i) => {
    const [a, b] = PAYOFF[h.jev + h.opp];
    you += a;
    opp += b;
    return `Round ${i + 1}: you ${word(h.jev)}, opponent ${word(h.opp)}; you got ${a}, opponent got ${b}.`;
  });
  return {
    state: {
      game: "Iterated Prisoner's Dilemma between you and one opponent. Each round both players choose at the same time without seeing the other's choice.",
      payoffs: PAYOFF_WORDS,
      goal: 'Maximise your total points over all rounds.',
      round: `Round ${round} of ${total}.`,
      score: { you, opponent: opp },
      history: rounds.length ? rounds : ['No rounds played yet.'],
    },
    questions: {
      action: {
        type: 'choice',
        instructions: 'Which move do you play this round?',
        criteria: { cooperate: 'Cooperate.', defect: 'Defect.' },
      },
      opp_will_cooperate: {
        type: 'noul',
        instructions: 'Will the opponent cooperate this round?',
      },
    },
  };
}

function hinted(p) {
  const req = base(p);
  const { round, total, history } = p;
  const oppC = history.filter((h) => h.opp === 'C').length;
  const n = history.length;
  const rate = n ? oppC / n : null;
  const bucket = rate === null ? 'unknown (no rounds played yet)'
    : rate >= 0.8 ? 'almost always cooperates'
    : rate >= 0.55 ? 'mostly cooperates'
    : rate >= 0.3 ? 'mixed, often defects'
    : 'almost always defects';
  const left = total - round;
  req.state.analysis = {
    opponent_tendency: n ? `${bucket} (cooperated in ${oppC} of ${n} rounds)` : bucket,
    rounds_remaining: left === 0 ? 'This is the final round.' : `${left} round${left === 1 ? '' : 's'} remain after this one.`,
  };
  return req;
}

export default {
  schema: SCHEMA,
  build: hinted,
  raw: { schema: SCHEMA, build: base },
};
