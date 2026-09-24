// Ultimatum Game, 8 rounds with alternating roles. Pot of 10 coins.
// role 'propose': Jev chooses how many coins to offer the human.
// role 'respond': Jev accepts or rejects the human's offer.
//
// Every comparison ("has the human accepted this little before?") is done here in code
// and written into the literal criteria of each option.
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
  if (acc && rej) return 'mixed evidence: the human has both accepted and rejected offers around this size';
  if (acc) return k === p.minAccepted ? 'the human has accepted exactly this offer before' : 'the human has accepted smaller offers than this before, so they will very likely accept';
  if (rej) return k === p.maxRejected ? 'the human has rejected exactly this offer before' : 'the human has rejected larger offers than this before, so they will likely reject';
  return 'untested: no evidence yet how the human responds to this amount';
}

function proposerStyle(p) {
  if (p.avgOffer === null) return 'unknown (the human has not proposed yet)';
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

function roundStatus(round, total) {
  const left = total - round;
  if (left === 0) return 'This is the FINAL round; there is no future reputation to protect.';
  if (left <= 2) return `Only ${left} round(s) remain after this one.`;
  return 'Several rounds remain; reputation still matters.';
}

export default {
  schema: S.obj({
    role: S.enumv('propose', 'respond'),
    round: S.int(1, ROUNDS),
    total: S.int(1, ROUNDS),
    offer: S.optional(S.int(0, POT)), // required when role = 'respond' (the human's offer to Jev)
    history: S.list(S.obj({ proposer: S.enumv('human', 'jev'), offer: S.int(0, POT), accepted: S.bool() }), ROUNDS),
  }),

  build({ role, round, total, offer, history }) {
    const p = profile(history);
    const recent = history.map((r, i) => (r.proposer === 'jev'
      ? `Round ${i + 1}: you offered the human ${r.offer}; the human ${r.accepted ? 'accepted' : 'rejected'}.`
      : `Round ${i + 1}: the human offered you ${r.offer}; you ${r.accepted ? 'accepted' : 'rejected'}.`));
    const base = {
      game: `Repeated Ultimatum Game between you and a human, ${total} rounds, roles alternate. Each round a pot of ${POT} coins is split: the proposer offers some coins to the responder; if the responder accepts, both get their share; if the responder rejects, both get nothing.`,
      goal: 'Maximise YOUR total coins over all rounds.',
      round_status: `Round ${round} of ${total}. ${roundStatus(round, total)}`,
    };

    if (role === 'propose') {
      const state = {
        ...base,
        your_role: 'You are the PROPOSER this round. The human decides whether to accept.',
        human_as_responder: responderStyle(p),
        human_lowest_accepted_offer: p.minAccepted === null ? 'none yet' : `${p.minAccepted} coins`,
        human_highest_rejected_offer: p.maxRejected === null ? 'none yet' : `${p.maxRejected} coins`,
        history: recent.length ? recent : ['No rounds played yet.'],
      };
      return {
        state,
        questions: {
          offer: {
            type: 'choice',
            instructions: 'How many coins should you offer the human to maximise your own expected coins? A rejected offer gives you nothing.',
            criteria: Object.fromEntries(OFFERS.map((s) => {
              const k = Number(s);
              return [s, `Offer ${k} coin${k === 1 ? '' : 's'} and keep ${POT - k}: ${fairness(k)}. Evidence: ${evidenceFor(k, p)}.`];
            })),
          },
          human_rejects_unfair: {
            type: 'noul',
            instructions: 'Is this human the kind of player who rejects offers they consider unfair, even at a cost to themselves?',
          },
        },
      };
    }

    if (offer === undefined) throw new SchemaError('payload.offer: missing');
    const state = {
      ...base,
      your_role: 'You are the RESPONDER this round.',
      offer_on_the_table: `The human offers you ${offer} of ${POT} coins and keeps ${POT - offer}. This is ${fairness(offer)}.`,
      if_you_accept: offer === 0 ? 'You get 0 coins; the human gets 10.' : `You get ${offer} coins; the human gets ${POT - offer}.`,
      if_you_reject: `You both get 0 coins this round.${round < total ? ' Rejecting may teach the human to offer more in later rounds.' : ''}`,
      human_as_proposer: proposerStyle(p),
      your_past_rejections: p.jevRejections === 0 ? 'you have not rejected any offer yet' : 'you have rejected at least one offer before',
      history: recent.length ? recent : ['No rounds played yet.'],
    };
    return {
      state,
      questions: {
        respond: {
          type: 'choice',
          instructions: 'Should you accept or reject the human\'s offer, to maximise your own total coins over the whole game?',
          criteria: {
            accept: `Accept: take the ${offer} coin${offer === 1 ? '' : 's'} offered now.`,
            reject: 'Reject: both get nothing this round; punishes a stingy offer and signals you will not accept such offers in future.',
          },
        },
        fair: {
          type: 'noul',
          instructions: 'Is the human\'s offer fair?',
        },
      },
    };
  },
};
