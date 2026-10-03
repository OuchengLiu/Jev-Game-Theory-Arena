import { blottoAnalysis } from './blotto-analysis.js';
import { S, SchemaError } from '../schema.js';

// Each ruleset has its own closure: no mutable cross-request rule state.
export function createBlottoRules(variant = 'standard') {
  if (!['standard', 'generalization'].includes(variant)) throw new Error('Unknown ruleset');
  const generalized = variant === 'generalization';
// Colonel Blotto — Jev plays one side.
// Each round both players secretly split 10 soldiers across three battlefields
// (Ridge, Ford, Fort). More soldiers takes a field; more fields takes the round.
//
// Clean ablation (see shared/prompts.js): base() builds the Raw request from the record
// (rules, neutral goal, round, score, full history, model candidates). Hinted = that identical
// base + `state.analysis` (opponent tendency words, what the estimates are based on) + an
// " Analysis: …" outlook suffix on each option. The browser (js/games/blotto-core.js)
// computes the estimates; the hinted payload is the raw record + basis/tendencies/candidates.
//
// Both model modes share the same history-selected candidates; only analysis differs.

const FIELDS = generalized ? ['Plain','Pass','Fort','Port'] : ['Ridge','Ford','Fort'];
const VALUES = generalized ? [1,2,3,4] : [1,1,1];
const SOLDIERS = 10;
const ROUNDS = 7;

// Full integer allocation space for human moves and revealed histories.
const ALLOCS = [];
function allocate(prefix,left) { if(prefix.length===FIELDS.length-1){ALLOCS.push([...prefix,left]);return;} for(let n=left;n>=0;n--)allocate([...prefix,n],left-n); }
allocate([],SOLDIERS);
const allocId = (x) => `a${x.join('-')}`;
const ALLOC_IDS = ALLOCS.map(allocId);
const BY_ID = Object.fromEntries(ALLOCS.map((x) => [allocId(x), x]));
const parseAlloc = (id) => BY_ID[id];

/** Per-field outcome from the first player's view: 1 won, -1 lost, 0 tied. */
const fieldResults = (a, b) => a.map((v, i) => {
 if (!generalized || i === 0) return Math.sign(v-b[i]);
 if (i===1) return Math.sign(Math.min(v,3)-Math.min(b[i],3));
 if (i===2) return Math.abs(v-b[i]) >= 2 ? Math.sign(v-b[i]) : 0;
 return Math.sign(Math.floor(v/2)-Math.floor(b[i]/2));
});
/** Round outcome from the first player's view: 1 won, -1 lost, 0 draw. */
function roundResult(a, b) {
  const f = fieldResults(a, b);
  return Math.sign(f.reduce((s, x, i) => s + x * VALUES[i], 0));
}

const OUTLOOKS = ['very_strong', 'strong', 'slight_edge', 'even', 'weak', 'very_weak'];
const BASES = ['typical_players', 'few_rounds', 'their_past_splits'];
const TENDENCIES = [
  'no_history', 'stacks_one_field', 'spreads_evenly', 'often_leaves_a_field_empty',
  'empties_ridge', 'empties_ford', 'empties_fort',
  'heavy_ridge', 'heavy_ford', 'heavy_fort',
  'light_ridge', 'light_ford', 'light_fort',
  'repeats_exact_splits', 'keeps_same_shape', 'varies_a_lot',
];
const MAX_CANDIDATES = Math.min(255,ALLOCS.length);

const ALLOC = S.enumv(ALLOC_IDS);
const ROUND = S.obj({ jev: ALLOC, opp: ALLOC });

const RAW_SCHEMA = S.obj({
  round: S.int(1, 15),
  total: S.int(1, 15),
  history: S.list(ROUND, 14),
});

// Hinted payload = the raw record + the code-computed analysis fields.
const SCHEMA = S.obj({
  ...RAW_SCHEMA.fields,
  basis: S.enumv(BASES),
  tendencies: S.list(S.enumv(TENDENCIES), 6),
  candidates: S.list(S.obj({ id: ALLOC, outlook: S.enumv(OUTLOOKS) }), MAX_CANDIDATES),
});

const RULES = generalized ? [
 'Both players secretly allocate exactly 10 soldiers to Plain, Pass, Fort, Port. The human can use all 286 allocations. You choose from 255 candidates, excluding the lowest estimated performers against past rounds only. Seven rounds; most wins wins the match.',
 'Plain: value 1, more soldiers wins. Pass: value 2, only the first 3 soldiers count. Fort: value 3, requires a lead of at least 2 soldiers; otherwise tied. Port: value 4, each complete pair is one strength; higher strength wins.',
 'Tied fields give neither player points. The higher total battlefield value wins the round; equal totals draw. Neither sees the current opposing allocation.'
 ] : [
  'Each round both players secretly split exactly 10 soldiers across three battlefields: the Ridge, the Ford and the Fort. Both players can use all 66 integer allocations.',
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

function roundLine(r, i) {
  const a = parseAlloc(r.jev);
  const b = parseAlloc(r.opp);
  const res = roundResult(a, b);
  const verdict = res > 0 ? 'you won the round' : res < 0 ? 'the opponent won the round' : 'the round was a draw';
  const fields = fieldResults(a, b).map((f, k) => `${FIELDS[k]} ${f > 0 ? 'won by you' : f < 0 ? 'won by the opponent' : 'tied'}`);
  return `Round ${i + 1}: you ${splitText(a)}; opponent ${splitText(b)}. ${fields.join('; ')}. Result: ${verdict}.`;
}

function scoreText(s) {
  return `Rounds won so far: you ${s.you}, opponent ${s.opp}; drawn rounds ${s.draws}.`;
}

const optionText = (x) => `${splitText(x)}.`;

/** Shared base: rules, neutral goal, round, score, full record, model candidates. */
function base(p) {
  checkRounds(p);
  const { round, total, history } = p;
  const criteria = {};
  const {picks}=blottoAnalysis(ALLOCS,roundResult,history.map(r=>parseAlloc(r.opp)),generalized);
  for(const i of picks) criteria[allocId(ALLOCS[i])] = optionText(ALLOCS[i]);
  return {
    state: {
      game: `Colonel Blotto, a ${total}-round match against one opponent.`,
      rules: RULES,
      goal: 'Win the match: win more rounds than the opponent.',
      round: `Round ${round} of ${total}.`,
      score: scoreText(tally(history)),
      history: history.length ? history.map((r, i) => roundLine(r, i)) : ['No rounds played yet.'],
    },
    questions: {
      action: {
        type: 'choice',
        instructions: `How do you split your ${SOLDIERS} soldiers across ${FIELDS.join(", ")} this round?`,
        criteria,
      },
      opp_stacks: {
        type: 'noul',
        instructions: 'Will the opponent put 5 or more soldiers on a single battlefield this round?',
      },
    },
  };
}

const RAW_FIELDS = ['round', 'total', 'history'];

function hinted(p) {
  const { tendencies, candidates, basis } = p;
  if (candidates.length !== MAX_CANDIDATES) throw new SchemaError('payload.candidates: wrong candidate count');
  const ids = new Set(candidates.map((c) => c.id));
  if (ids.size !== candidates.length) throw new SchemaError('payload.candidates: duplicate id');
  if (new Set(tendencies).size !== tendencies.length) throw new SchemaError('payload.tendencies: duplicate');
  const req = base(Object.fromEntries(RAW_FIELDS.map((k) => [k, p[k]])));
  const all = req.questions.action.criteria;
  if(candidates.some((c,i)=>c.id!==Object.keys(all)[i]))throw new SchemaError('payload.candidates: must match history-selected candidates in neutral order');
  const criteria = {};
  for (const c of candidates) {
    criteria[c.id] = `${all[c.id]} Analysis: against the opponent's likely splits it ${WORDS.outlook[c.outlook]}.`;
  }
  req.questions.action.criteria = criteria;
  req.state.analysis = {
    options: `Both model modes share ${MAX_CANDIDATES} candidates; the human can use all ${ALLOCS.length} allocations.`,
    estimates: WORDS.basis[basis],
    opponent_tendencies: tendencies.length ? tendencies.map((k) => WORDS.tendency[k]) : ['No clear pattern yet.'],
  };
  return req;
}

const prompt = { schema: SCHEMA, build: hinted, raw: { schema: RAW_SCHEMA, build: base } };

return { FIELDS, VALUES, SOLDIERS, ROUNDS, ALLOCS, allocId, ALLOC_IDS, parseAlloc, fieldResults, roundResult, OUTLOOKS, BASES, TENDENCIES, MAX_CANDIDATES, prompt };
}

const standard = createBlottoRules();
export const { FIELDS, VALUES, SOLDIERS, ROUNDS, ALLOCS, allocId, ALLOC_IDS, parseAlloc, fieldResults, roundResult, OUTLOOKS, BASES, TENDENCIES, MAX_CANDIDATES } = standard;
export default standard.prompt;
