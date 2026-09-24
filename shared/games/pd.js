// Iterated Prisoner's Dilemma — Jev plays one side.
import { S } from '../schema.js';

const MOVE = S.enumv('C', 'D');

export default {
  schema: S.obj({
    round: S.int(1, 50),
    total: S.int(1, 50),
    history: S.list(S.obj({ jev: MOVE, opp: MOVE }), 50),
  }),

  build({ round, total, history }) {
    const word = (m) => (m === 'C' ? 'cooperated' : 'defected');
    const recent = history.slice(-12);
    const oppC = history.filter((h) => h.opp === 'C').length;
    const rate = history.length ? oppC / history.length : null;
    const bucket = rate === null ? 'unknown (first round)'
      : rate >= 0.8 ? 'almost always cooperates'
      : rate >= 0.55 ? 'mostly cooperates'
      : rate >= 0.3 ? 'mixed, often defects'
      : 'almost always defects';
    const left = Math.max(0, total - round);

    const state = {
      game: "Iterated Prisoner's Dilemma between you and one opponent.",
      payoffs: {
        both_cooperate: 'each gets 3 points',
        both_defect: 'each gets 1 point',
        you_defect_they_cooperate: 'you get 5, they get 0',
        you_cooperate_they_defect: 'you get 0, they get 5',
      },
      goal: 'Maximise YOUR total points over all rounds.',
      round_status: left === 0 ? 'This is the FINAL round; there is no future to protect.'
        : left <= 2 ? `Only ${left} round(s) remain after this one.`
        : 'Many rounds remain; reputation matters.',
      opponent_tendency: bucket,
      opponent_last_move: history.length ? word(history[history.length - 1].opp) : 'none yet',
      recent_rounds: recent.map((h, i) => `Round ${history.length - recent.length + i + 1}: you ${word(h.jev)}, opponent ${word(h.opp)}`),
    };

    return {
      state,
      questions: {
        action: {
          type: 'choice',
          instructions: 'Which move should you play this round to maximise your own total score?',
          criteria: {
            cooperate: 'Cooperate: build or keep mutual trust; best when the opponent reciprocates cooperation.',
            defect: 'Defect: exploit or punish; best when the opponent defects, or when no future rounds remain.',
          },
        },
        opp_will_cooperate: {
          type: 'noul',
          instructions: 'Will the opponent cooperate this round?',
        },
      },
    };
  },
};
