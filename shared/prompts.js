// Single source of truth for every question we ever send to Jev.
// Imported by the browser (direct / BYOK mode) and by the Worker proxy.
//
// Contract for each game module in ./games:
//   schema : strict S.obj(...) describing the compact payload the browser sends
//   build(payload) -> { state, questions }   (a TypeSafe System One request body)
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

export const MODEL = 'jev-latest';
export const GAME_PROMPTS = { pd, rps, ultimatum, holdem, liarsdice };

export function buildJevRequest(game, payload) {
  const g = Object.prototype.hasOwnProperty.call(GAME_PROMPTS, game) ? GAME_PROMPTS[game] : null;
  if (!g) throw new SchemaError('unknown game');
  const clean = check(g.schema, payload);
  const { state, questions } = g.build(clean);
  return { model: MODEL, state, questions };
}

export { SchemaError };
