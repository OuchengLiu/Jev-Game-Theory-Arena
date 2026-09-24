// Ultimatum Game, 8 rounds with alternating roles. Pot of 10 coins.
// role 'propose': Jev chooses how many coins to offer the human.
// role 'respond': Jev accepts or rejects the human's offer.
//
// Clean ablation (see shared/prompts.js): base() builds the Raw request from the record;
// Hinted = that identical base + `state.analysis` (profile of the opponent's past
// proposals/responses, rounds remaining) + an " Analysis: …" suffix on each option (the
// fairness bucket of the split and what the opponent's past responses say about it).
// Both modes take the same payload.
import { S, SchemaError } from '../schema.js';

export const POT = 10;
export const ROUNDS = 8;
export const OFFERS = Array.from({ length: POT + 1 }, (_, k) => String(k));

/** Semantic fairness word for an offer of k coins (to the responder) out of 10. */
export function fairness(k) {
  if (k === 0) return 'nothing at all; the proposer keeps everything';
  if (k <= 2) return 'very unfair to the responder';
  if (k === 3) return 'unfair to the responder';
  if (k === 4) return 'slightly less than an even split';
  if (k === 5) return 'an even split';
  if (k <= 7) return 'generous to the responder';
  if (k === POT) return 'everything to the responder; the proposer keeps nothing';
  return 'extremely generous; the proposer keeps almost nothing';
}

/** Facts about the human's behaviour, computed in code. */
export function profile(history) {
  const asResp = history.filter((r) => r.proposer === 'jev');
  const asProp = history.filter((r) => r.proposer === 'human');
  const accepted = asResp.filter((r) => r.accepted).map((r) => r.offer);
  const rejected = asResp.filter((r) => !r.accepted).map((r) => r.offer);
  const minAccepted = accepted.length ? Math.min(...accepted) : null;
  const maxRejected = rejected.length ? Math.max(...rejected) : null;
  const offers = asProp.map((r) => r.offer);
  const avgOffer = offers.length ? offers.reduce((a, b) => a + b, 0) / offers.length : null;
  const jevRejections = asProp.filter((r) => !r.accepted).length;
  return { asResp, asProp, accepted, rejected, minAccepted, maxRejected, offers, avgOffer, jevRejections };
}

/** What the human's past responses say about an offer of k coins. */
export function evidenceFor(k, p) {
  const acc = p.minAccepted !== null && k >= p.minAccepted;
  const rej = p.maxRejected !== null && k <= p.maxRejected;
  if (acc && rej) return 'mixed evidence: the opponent has both accepted and rejected offers around this size';
  if (acc) return k === p.minAccepted ? 'the opponent has accepted exactly this offer before' : 'the opponent has accepted smaller offers than this before, so they will very likely accept';
  if (rej) return k === p.maxRejected ? 'the opponent has rejected exactly this offer before' : 'the opponent has rejected larger offers than this before, so they will likely reject';
  return 'untested: no evidence yet how the opponent responds to this amount';
}

function proposerStyle(p) {
  if (p.avgOffer === null) return 'unknown (the opponent has not proposed yet)';
  if (p.avgOffer >= 5) return 'fair or generous: offers you about half or more';
  if (p.avgOffer >= 4) return 'nearly fair: offers you a bit less than half';
  if (p.avgOffer >= 2.5) return 'stingy: keeps most of the pot';
  return 'very stingy: offers you almost nothing';
}

function responderStyle(p) {
  if (!p.asResp.length) return 'unknown (you have not proposed yet)';
  if (!p.rejected.length) return 'has accepted every offer so far';
  if (!p.accepted.length) return 'has rejected every offer so far';
  return 'accepts some offers and rejects others, depending on size';
}

function roundsRemaining(round, total) {
  const left = total - round;
  return left === 0 ? 'This is the final round.' : `${left} round${left === 1 ? '' : 's'} remain after this one.`;
}

const SCHEMA = S.obj({
  role: S.enumv('propose', 'respond'),
  round: S.int(1, ROUNDS),
  total: S.int(1, ROUNDS),
  offer: S.optional(S.int(0, POT)), // required when role = 'respond' (the human's offer to Jev)
  history: S.list(S.obj({ proposer: S.enumv('human', 'jev'), offer: S.int(0, POT), accepted: S.bool() }), ROUNDS),
});

const coinsWord = (k) => `${k} coin${k === 1 ? '' : 's'}`;

/** Shared base: rules, neutral goal, round, role, score, full record, literal options. */
function base({ role, round, total, offer, history }) {
  if (round > total || round !== history.length + 1) throw new SchemaError('payload.round: inconsistent with history');
  if (role === 'respond' && offer === undefined) throw new SchemaError('payload.offer: missing');
  if (role === 'propose' && offer !== undefined) throw new SchemaError('payload.offer: unexpected');
  let you = 0;
  let opp = 0;
  const rounds = history.map((r, i) => {
    const toJev = r.accepted ? (r.proposer === 'human' ? r.offer : POT - r.offer) : 0;
    const toOpp = r.accepted ? (r.proposer === 'human' ? POT - r.offer : r.offer) : 0;
    you += toJev;
    opp += toOpp;
    const what = r.proposer === 'jev'
      ? `you proposed, offering the opponent ${r.offer} and keeping ${POT - r.offer}; the opponent ${r.accepted ? 'accepted' : 'rejected'}`
      : `the opponent proposed, offering you ${r.offer} and keeping ${POT - r.offer}; you ${r.accepted ? 'accepted' : 'rejected'}`;
    return `Round ${i + 1}: ${what}. You got ${toJev}, the opponent got ${toOpp}.`;
  });
  const state = {
    game: `Repeated Ultimatum Game between you and one opponent, ${total} rounds, roles alternate. Each round a pot of ${POT} coins is split: the proposer offers some coins to the responder; if the responder accepts, both get their share; if the responder rejects, both get nothing.`,
    goal: 'Maximise your total coins over all rounds.',
    round: `Round ${round} of ${total}.`,
    your_role: role === 'propose' ? 'You are the PROPOSER this round; the opponent responds.' : 'You are the RESPONDER this round; the opponent proposed.',
    score: { you, opponent: opp },
    history: rounds.length ? rounds : ['No rounds played yet.'],
  };
  if (role === 'propose') {
    return {
      state,
      questions: {
        offer: {
          type: 'choice',
          instructions: 'How many coins do you offer the opponent?',
          criteria: Object.fromEntries(OFFERS.map((s) => {
            const k = Number(s);
            return [s, `Offer ${coinsWord(k)}, keep ${POT - k}.`];
          })),
        },
        human_rejects_unfair: {
          type: 'noul',
          instructions: 'Is this opponent the kind of player who rejects low offers, even at a cost to themselves?',
        },
      },
    };
  }
  state.offer_on_the_table = `The opponent offers you ${coinsWord(offer)} and keeps ${POT - offer}.`;
  return {
    state,
    questions: {
      respond: {
        type: 'choice',
        instructions: "Do you accept or reject the opponent's offer?",
        criteria: {
          accept: `Accept: you get ${coinsWord(offer)}, the opponent gets ${POT - offer}.`,
          reject: 'Reject: both get 0 coins this round.',
        },
      },
      fair: {
        type: 'noul',
        instructions: "Is the opponent's offer fair?",
      },
    },
  };
}

function hinted(payload) {
  const req = base(payload);
  const { role, round, total, offer, history } = payload;
  const p = profile(history);
  if (role === 'propose') {
    req.state.analysis = {
      rounds_remaining: roundsRemaining(round, total),
      opponent_as_responder: responderStyle(p),
      opponent_lowest_accepted_offer: p.minAccepted === null ? 'none yet' : coinsWord(p.minAccepted),
      opponent_highest_rejected_offer: p.maxRejected === null ? 'none yet' : coinsWord(p.maxRejected),
    };
    const crit = req.questions.offer.criteria;
    for (const s of OFFERS) {
      const k = Number(s);
      crit[s] += ` Analysis: ${fairness(k)}. Evidence: ${evidenceFor(k, p)}.`;
    }
    return req;
  }
  req.state.analysis = {
    rounds_remaining: roundsRemaining(round, total),
    offer_fairness: `This offer is ${fairness(offer)}.`,
    opponent_as_proposer: proposerStyle(p),
    your_past_rejections: p.jevRejections === 0 ? 'You have not rejected any offer yet.' : `You have rejected ${p.jevRejections} offer${p.jevRejections === 1 ? '' : 's'} before.`,
  };
  req.questions.respond.criteria.accept += ` Analysis: ${fairness(offer)}.`;
  return req;
}

export default {
  schema: SCHEMA,
  build: hinted,
  raw: { schema: SCHEMA, build: base },
};
