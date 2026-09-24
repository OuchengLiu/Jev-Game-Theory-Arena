// Colonel Blotto — Jev plays one side.
// Each round both players secretly split 10 soldiers across three battlefields
// (Ridge, Ford, Fort). More soldiers takes a field; more fields takes the round.
//
// Hinted mode: the browser (js/games/blotto-core.js) estimates how every split fares
// against the opponent's past splits and sends a shortlist with a semantic outlook word
// for each, plus tendency words. Raw mode: only the rules, the record and all 66 splits.
//
// Allocations travel as ids like "a5-3-2" (Ridge-Ford-Fort). The enum of all 66 legal
// ids doubles as the "must sum to 10" check: no other id passes the schema.
import { S, SchemaError } from '../schema.js';

export const FIELDS = ['Ridge', 'Ford', 'Fort'];
export const SOLDIERS = 10;
export const ROUNDS = 7;

/** All 66 ways to split 10 soldiers over 3 fields, Ridge-heavy first. */
export const ALLOCS = [];
for (let a = SOLDIERS; a >= 0; a--) for (let b = SOLDIERS - a; b >= 0; b--) ALLOCS.push([a, b, SOLDIERS - a - b]);
export const allocId = (x) => `a${x.join('-')}`;
export const ALLOC_IDS = ALLOCS.map(allocId);
const BY_ID = Object.fromEntries(ALLOCS.map((x) => [allocId(x), x]));
export const parseAlloc = (id) => BY_ID[id];

/** Per-field outcome from the first player's view: 1 won, -1 lost, 0 tied. */
export const fieldResults = (a, b) => a.map((v, i) => Math.sign(v - b[i]));
/** Round outcome from the first player's view: 1 won, -1 lost, 0 draw. */
export function roundResult(a, b) {
  const f = fieldResults(a, b);
  return Math.sign(f.reduce((s, x) => s + x, 0));
}

export const OUTLOOKS = ['very_strong', 'strong', 'slight_edge', 'even', 'weak', 'very_weak'];
export const BASES = ['typical_players', 'few_rounds', 'their_past_splits'];
export const TENDENCIES = [
  'no_history', 'stacks_one_field', 'spreads_evenly', 'often_leaves_a_field_empty',
  'empties_ridge', 'empties_ford', 'empties_fort',
  'heavy_ridge', 'heavy_ford', 'heavy_fort',
  'light_ridge', 'light_ford', 'light_fort',
  'repeats_exact_splits', 'keeps_same_shape', 'varies_a_lot',
];
export const MAX_CANDIDATES = 16;

const ALLOC = S.enumv(ALLOC_IDS);
const ROUND = S.obj({ jev: ALLOC, opp: ALLOC });

const RAW_SCHEMA = S.obj({
  round: S.int(1, 15),
  total: S.int(1, 15),
  history: S.list(ROUND, 14),
});

const SCHEMA = S.obj({
  round: S.int(1, 15),
  total: S.int(1, 15),
  history: S.list(ROUND, 14),
  basis: S.enumv(BASES),
  tendencies: S.list(S.enumv(TENDENCIES), 6),
  candidates: S.list(S.obj({ id: ALLOC, outlook: S.enumv(OUTLOOKS) }), MAX_CANDIDATES),
});

const RULES = [
  'Each round both players secretly split exactly 10 soldiers across three battlefields: the Ridge, the Ford and the Fort. Any whole number from 0 to 10 may go to each field.',
  'A battlefield is won by whoever placed MORE soldiers there. Equal numbers means nobody wins that field.',
  'Whoever wins more battlefields wins the round; otherwise the round is a draw.',
  'Splits are revealed at the same time, so you cannot react to the opponent this round.',
];

const WORDS = {
  basis: {
    typical_players: 'No rounds played yet, so the estimates are against the splits typical human players choose.',
    few_rounds: 'Only a few rounds played, so the estimates blend the opponent’s past splits with typical human splits.',
    their_past_splits: 'The estimates are against the opponent’s past splits (including rearrangements of the same numbers across fields).',
  },
  outlook: {
    very_strong: 'wins very often',
    strong: 'wins more often than it loses',
    slight_edge: 'has a slight edge',
    even: 'is roughly even',
    weak: 'loses more often than it wins',
    very_weak: 'usually loses',
  },
  tendency: {
    no_history: 'No rounds played yet: nothing is known about this opponent.',
    stacks_one_field: 'Tends to stack one field heavily (6 or more soldiers on it).',
    spreads_evenly: 'Tends to spread soldiers evenly (no field above 4).',
    often_leaves_a_field_empty: 'Often leaves a field completely empty.',
    empties_ridge: 'Often leaves the Ridge empty.',
    empties_ford: 'Often leaves the Ford empty.',
    empties_fort: 'Often leaves the Fort empty.',
    heavy_ridge: 'Usually sends many soldiers to the Ridge.',
    heavy_ford: 'Usually sends many soldiers to the Ford.',
    heavy_fort: 'Usually sends many soldiers to the Fort.',
    light_ridge: 'Usually sends few soldiers to the Ridge.',
    light_ford: 'Usually sends few soldiers to the Ford.',
    light_fort: 'Usually sends few soldiers to the Fort.',
    repeats_exact_splits: 'Has repeated an exact split from an earlier round.',
    keeps_same_shape: 'Keeps using the same numbers, only moving them between fields.',
    varies_a_lot: 'Changes the shape of their split almost every round.',
  },
};

const splitText = (x) => FIELDS.map((f, i) => `${f} ${x[i]}`).join(', ');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function checkRounds({ round, total, history }) {
  if (round > total) throw new SchemaError('payload.round: beyond total');
  if (history.length !== round - 1) throw new SchemaError('payload.history: length does not match round');
}

function tally(history) {
  const s = { you: 0, opp: 0, draws: 0 };
  for (const r of history) {
    const res = roundResult(parseAlloc(r.jev), parseAlloc(r.opp));
    if (res > 0) s.you++; else if (res < 0) s.opp++; else s.draws++;
  }
  return s;
}

function roundLine(r, i, detailed) {
  const a = parseAlloc(r.jev);
  const b = parseAlloc(r.opp);
  const res = roundResult(a, b);
  const verdict = res > 0 ? 'you won the round' : res < 0 ? 'the opponent won the round' : 'the round was a draw';
  let line = `Round ${i + 1}: you ${splitText(a)}; opponent ${splitText(b)}`;
  if (detailed) {
    const fields = fieldResults(a, b).map((f, k) => `${FIELDS[k]} ${f > 0 ? 'won by you' : f < 0 ? 'won by the opponent' : 'tied'}`);
    line += `. ${fields.join('; ')}`;
  }
  return `${line}. Result: ${verdict}.`;
}

function scoreText(s) {
  return `Rounds won so far: you ${s.you}, opponent ${s.opp}; drawn rounds ${s.draws}.`;
}

// ---------- Raw mode: the bare record and all 66 splits ----------
function buildRaw(p) {
  checkRounds(p);
  const { round, total, history } = p;
  const criteria = {};
  for (const x of ALLOCS) criteria[allocId(x)] = splitText(x);
  return {
    state: {
      game: `Colonel Blotto, a ${total}-round match against one opponent. Whoever wins more rounds wins the match.`,
      rules: RULES,
      round: `Round ${round} of ${total}.`,
      score: scoreText(tally(history)),
      history: history.length ? history.map((r, i) => roundLine(r, i, true)) : ['No rounds played yet.'],
    },
    questions: {
      action: {
        type: 'choice',
        instructions: 'How do you split your 10 soldiers across the Ridge, the Ford and the Fort this round?',
        criteria,
      },
      opp_stacks: {
        type: 'noul',
        instructions: 'Will the opponent put 5 or more soldiers on a single battlefield this round?',
      },
    },
  };
}

// ---------- Hinted mode: code-computed outlooks as words ----------
function build(p) {
  checkRounds(p);
  const { round, total, history, basis, tendencies, candidates } = p;
  if (!candidates.length) throw new SchemaError('payload.candidates: empty');
  const ids = new Set(candidates.map((c) => c.id));
  if (ids.size !== candidates.length) throw new SchemaError('payload.candidates: duplicate id');
  if (new Set(tendencies).size !== tendencies.length) throw new SchemaError('payload.tendencies: duplicate');

  const s = tally(history);
  const left = total - round;
  const lead = s.you - s.opp;
  const situation = [
    left === 0 ? 'This is the FINAL round.' : left === 1 ? 'One round remains after this one.' : `${left} rounds remain after this one.`,
    lead === 0 ? 'The match is level.' : lead > 0 ? `You lead the match by ${plural(lead, 'round')}.` : `You trail the match by ${plural(-lead, 'round')}.`,
  ].join(' ');
  const recent = history.slice(-3);

  const criteria = {};
  for (const c of candidates) {
    criteria[c.id] = `${splitText(parseAlloc(c.id))}. Against this opponent's likely splits it ${WORDS.outlook[c.outlook]}.`;
  }

  return {
    state: {
      game: `Colonel Blotto, a ${total}-round match against one opponent. Whoever wins more rounds wins the match.`,
      rules: RULES,
      theory: 'There is no single best split: every fixed split can be beaten by another. A predictable player gets countered, so mix your choices and exploit the opponent’s habits only as far as they are reliable.',
      round: `Round ${round} of ${total}. ${scoreText(s)}`,
      situation,
      opponent_tendencies: tendencies.length ? tendencies.map((k) => WORDS.tendency[k]) : ['No clear pattern yet.'],
      estimates: WORDS.basis[basis],
      recent_rounds: recent.length
        ? recent.map((r, i) => roundLine(r, history.length - recent.length + i, false))
        : ['No rounds played yet.'],
    },
    questions: {
      action: {
        type: 'choice',
        instructions: 'Which split of your 10 soldiers across the Ridge, the Ford and the Fort gives you the best chance to win this round? Each option states the split and how it fares against the opponent’s likely splits.',
        criteria,
      },
      opp_stacks: {
        type: 'noul',
        instructions: 'Will the opponent put 5 or more soldiers on a single battlefield this round?',
      },
    },
  };
}

export default { schema: SCHEMA, build, raw: { schema: RAW_SCHEMA, build: buildRaw } };
