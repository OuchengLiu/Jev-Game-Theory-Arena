// Anonymous gameplay telemetry: the event format, shared by the browser and the Worker.
//
// Privacy by design: an event says *what happened in a game* ("round 3, human defected"),
// never who played it. No IP, account, device fingerprint or free text is stored; the only
// link between events is a random per-match id generated in the browser.
//
// Batch (POST /log):
//   { s: matchId, r: researchOptIn, l: 'en'|'zh', av: appVersion, e: [event, …] }
// Event:
//   { g: game, gv: gameVersion, m: 'hinted'|'raw'|'practice',   // opponent mode selected
//     k: 'move'|'end',
//     a: 'human'|'jev'|'bot',                                    // who acted (move)
//     mdl?: jev model version, ph?: phase, act: action, x?: detail }
// For k:'end', act is the result from the human's side: 'win'|'lose'|'draw'.

import { S, check, SchemaError } from './schema.js';

const range = (prefix, from, to) => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);

// Blotto split "shapes": the 3 numbers sorted high→low (10 soldiers, 3 fields) → 14 shapes.
const SHAPES = [];
for (let a = 10; a >= 0; a--) for (let b = Math.min(a, 10 - a); b >= 0; b--) { const c = 10 - a - b; if (c <= b) SHAPES.push(`${a}-${b}-${c}`); }

/** Per game: allowed phases, actions and details. Anything else is rejected. */
export const SPECS = {
  pd: {
    phases: range('r', 1, 50), acts: ['C', 'D'], xs: [],
  },
  rps: {
    // opponent moves carry whether the prediction behind them was right
    phases: range('r', 1, 20), acts: ['rock', 'paper', 'scissors'], xs: ['hit', 'miss'],
  },
  ultimatum: {
    // proposals: o0…o10 (coins offered to the other side); responses: accept/reject with x = offer
    phases: range('r', 1, 8), acts: [...range('o', 0, 10), 'accept', 'reject'], xs: range('', 0, 10),
  },
  blotto: {
    phases: range('r', 1, 15), acts: SHAPES, xs: ['win', 'lose', 'draw'],
  },
  liarsdice: {
    // bids carry how plausible they were from the bidder's own dice; Liar calls whether they were right
    phases: ['open', 'raise'], acts: ['bid', 'liar'], xs: ['likely', 'even', 'unlikely', 'right', 'wrong'],
  },
  holdem: {
    // x = the actor's hand strength bucket at that moment (computed in code)
    phases: ['preflop', 'flop', 'turn', 'river'], acts: ['fold', 'check', 'call', 'bet', 'raise', 'allin'], xs: ['weak', 'medium', 'strong'],
  },
};
export const GAMES = Object.keys(SPECS);
export const RESULTS = ['win', 'lose', 'draw'];
export const MAX_EVENTS = 60;

const VERSION = /^\d{1,3}(\.\d{1,3}){0,2}$/;
const MODEL = /^[a-z0-9][a-z0-9.\-]{0,31}$/;
const MATCH_ID = /^[a-z0-9]{12,24}$/;

const allActs = [...new Set(GAMES.flatMap((g) => [...SPECS[g].acts, ...RESULTS]))];
const allPhases = [...new Set(GAMES.flatMap((g) => SPECS[g].phases))];
const allXs = [...new Set(GAMES.flatMap((g) => SPECS[g].xs))];

const EVENT = S.obj({
  g: S.enumv(GAMES),
  gv: S.enumv('_'), // placeholder, checked by regex below
  m: S.enumv('hinted', 'raw', 'practice'),
  k: S.enumv('move', 'end'),
  a: S.optional(S.enumv('human', 'jev', 'bot')),
  mdl: S.optional(S.enumv('_')),
  ph: S.optional(S.enumv(allPhases)),
  act: S.enumv(allActs),
  x: S.optional(S.enumv(allXs)),
});

/** Validate a /log batch. Returns a clean copy or throws SchemaError. */
export function checkBatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new SchemaError('batch: not an object');
  const keys = Object.keys(body);
  for (const k of keys) if (!['s', 'r', 'l', 'av', 'e'].includes(k)) throw new SchemaError(`batch: unexpected field "${k}"`);
  if (typeof body.s !== 'string' || !MATCH_ID.test(body.s)) throw new SchemaError('batch.s: invalid');
  if (typeof body.r !== 'boolean') throw new SchemaError('batch.r: invalid');
  if (!['en', 'zh'].includes(body.l)) throw new SchemaError('batch.l: invalid');
  if (typeof body.av !== 'string' || !VERSION.test(body.av)) throw new SchemaError('batch.av: invalid');
  if (!Array.isArray(body.e) || body.e.length === 0 || body.e.length > MAX_EVENTS) throw new SchemaError('batch.e: invalid length');

  const events = body.e.map((ev, i) => {
    if (!ev || typeof ev !== 'object') throw new SchemaError(`e[${i}]: invalid`);
    const { gv, mdl, ...rest } = ev;
    if (typeof gv !== 'string' || !VERSION.test(gv)) throw new SchemaError(`e[${i}].gv: invalid`);
    if (mdl !== undefined && (typeof mdl !== 'string' || !MODEL.test(mdl))) throw new SchemaError(`e[${i}].mdl: invalid`);
    const clean = check(EVENT, { ...rest, gv: '_', ...(mdl !== undefined ? { mdl: '_' } : {}) }, `e[${i}]`);
    clean.gv = gv;
    if (mdl !== undefined) clean.mdl = mdl;
    const spec = SPECS[clean.g];
    if (clean.k === 'end') {
      if (!RESULTS.includes(clean.act) || clean.a || clean.ph || clean.x) throw new SchemaError(`e[${i}]: bad end event`);
    } else {
      if (!clean.a || !spec.acts.includes(clean.act)) throw new SchemaError(`e[${i}]: bad action for ${clean.g}`);
      if (clean.ph !== undefined && !spec.phases.includes(clean.ph)) throw new SchemaError(`e[${i}]: bad phase for ${clean.g}`);
      if (clean.x !== undefined && !spec.xs.includes(clean.x)) throw new SchemaError(`e[${i}]: bad detail for ${clean.g}`);
      if (clean.a === 'jev' && clean.m === 'practice') throw new SchemaError(`e[${i}]: jev in practice mode`);
    }
    return clean;
  });
  return { s: body.s, r: body.r, l: body.l, av: body.av, e: events };
}
