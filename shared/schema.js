// Tiny, dependency-free validator shared by the browser and the Cloudflare Worker.
// Every game payload is validated against a strict schema before a Jev request is
// built from it, so the proxy can never be used as a general-purpose Jev endpoint.

export const S = {
  enumv: (...vals) => ({ t: 'enum', vals: vals.flat() }),
  int: (min, max) => ({ t: 'int', min, max }),
  bool: () => ({ t: 'bool' }),
  list: (item, max) => ({ t: 'list', item, max }),
  obj: (fields) => ({ t: 'obj', fields }),
  optional: (inner) => ({ ...inner, optional: true }),
};

export class SchemaError extends Error {}

export function check(schema, v, path = 'payload') {
  const fail = (msg) => { throw new SchemaError(`${path}: ${msg}`); };
  if (v === undefined || v === null) {
    if (schema.optional) return undefined;
    fail('missing');
  }
  switch (schema.t) {
    case 'enum':
      if (!schema.vals.includes(v)) fail('invalid value');
      return v;
    case 'int':
      if (!Number.isInteger(v) || v < schema.min || v > schema.max) fail('out of range');
      return v;
    case 'bool':
      if (typeof v !== 'boolean') fail('not boolean');
      return v;
    case 'list': {
      if (!Array.isArray(v)) fail('not a list');
      if (v.length > schema.max) fail('too long');
      return v.map((x, i) => check(schema.item, x, `${path}[${i}]`));
    }
    case 'obj': {
      if (typeof v !== 'object' || Array.isArray(v)) fail('not an object');
      const out = {};
      for (const k of Object.keys(v)) if (!(k in schema.fields)) fail(`unexpected field "${k}"`);
      for (const [k, sub] of Object.entries(schema.fields)) {
        const r = check(sub, v[k], `${path}.${k}`);
        if (r !== undefined) out[k] = r;
      }
      return out;
    }
    default:
      fail('bad schema');
  }
}

// Card helpers shared by card games.
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const SUITS = ['s', 'h', 'd', 'c'];
export const CARDS = RANKS.flatMap((r) => SUITS.map((s) => r + s));
const RANK_NAMES = { 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', T: 'Ten', J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace' };
const SUIT_NAMES = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
export const cardName = (c) => `${RANK_NAMES[c[0]]} of ${SUIT_NAMES[c[1]]}`;
