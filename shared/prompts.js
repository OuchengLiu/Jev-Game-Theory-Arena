// Jev Game Theory Lab · © the Jev Game Theory Lab authors · see LICENSE · canary GUID JGTL-CANARY-7c006748-fdca-49c4-ba68-4f6b9bd0cd16
// Single source of truth for every question we ever send to Jev.
// Imported by the browser (direct / BYOK mode) and by the Worker proxy.
//
// Contract for each game module in ./games:
//   schema : strict S.obj(...) describing the compact payload the browser sends
//   build(payload) -> { state, questions }   (a TypeSafe System One request body)
//   raw    : optional { schema, build } for "Raw" mode — no code-computed odds or
//            buckets, only the raw record (moves, stacks, results) plus the legal
//            options. Must use the same question ids as build() for the main decision.
//
// Modes: 'hinted' (default) = code does the maths and hands Jev semantic buckets;
//        'raw' = Jev judges from the raw context alone.
//
// Jev tips we follow (see docs.typesafe.ai/model-jaggedness/jev-1.13):
//   * keep arithmetic in code; hand Jev semantic buckets ("strong", "likely")
//   * one decision per question, criteria describing each option literally
//   * small, relevant state

import { validateChoiceLimits } from './decision-limits.js';
import { check, SchemaError } from './schema.js';
import { createPd } from './games/pd.js';
import { createRps } from './games/rps.js';
import { createUltimatum } from './games/ultimatum.js';
import { createHoldemPrompt } from './games/holdem.js';
import { createDicePrompt } from './games/liarsdice.js';
import { createBlottoRules } from './games/blotto.js';

export const MODEL = 'jev-latest';
const factories = {pd:createPd,rps:createRps,ultimatum:createUltimatum,holdem:createHoldemPrompt,liarsdice:createDicePrompt,blotto:createBlottoRules};
export const PROMPTS = Object.fromEntries(['standard','generalization'].map(v=>[v,Object.fromEntries(Object.entries(factories).map(([k,f])=>[k,f(v).prompt]))]));
export const GAME_PROMPTS = PROMPTS.standard;

export const MODES = ['hinted', 'raw'];

export function buildJevRequest(game, payload, mode = 'hinted', variant = 'standard') {
  if (!Object.hasOwn(PROMPTS,variant)) throw new SchemaError('unknown ruleset');
  const GAME_PROMPTS = PROMPTS[variant];
  const g = Object.prototype.hasOwnProperty.call(GAME_PROMPTS, game) ? GAME_PROMPTS[game] : null;
  if (!g) throw new SchemaError('unknown game');
  if (!MODES.includes(mode)) throw new SchemaError('unknown mode');
  const impl = mode === 'raw' && g.raw ? g.raw : g;
  const clean = check(impl.schema, payload);
  const { state, questions } = impl.build(clean);
  validateChoiceLimits(questions);
  return { model: MODEL, state, questions };
}

export { SchemaError };
