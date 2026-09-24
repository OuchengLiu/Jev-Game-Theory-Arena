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

import { check, SchemaError } from './schema.js';
import pd from './games/pd.js';
import rps from './games/rps.js';
import ultimatum from './games/ultimatum.js';
import holdem from './games/holdem.js';
import liarsdice from './games/liarsdice.js';
import blotto from './games/blotto.js';

export const MODEL = 'jev-latest';
export const GAME_PROMPTS = { pd, rps, ultimatum, holdem, liarsdice, blotto };

export const MODES = ['hinted', 'raw'];

export function buildJevRequest(game, payload, mode = 'hinted') {
  const g = Object.prototype.hasOwnProperty.call(GAME_PROMPTS, game) ? GAME_PROMPTS[game] : null;
  if (!g) throw new SchemaError('unknown game');
  if (!MODES.includes(mode)) throw new SchemaError('unknown mode');
  const impl = mode === 'raw' && g.raw ? g.raw : g;
  const clean = check(impl.schema, payload);
  const { state, questions } = impl.build(clean);
  return { model: MODEL, state, questions };
}

export { SchemaError };
