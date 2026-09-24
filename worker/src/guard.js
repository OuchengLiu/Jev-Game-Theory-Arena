// Guard — a single Durable Object that keeps exact usage counters.
//
// Durable Objects process requests one at a time, so the counters are exact even under
// concurrency (unlike KV). Storage is the SQLite-backed key-value API (free plan).
//
// Keys (all reset at 00:00 UTC):
//   g            calls made today, site-wide
//   i:<ipHash>   calls made today by one visitor
//   b:<ipHash>   invalid requests today by one visitor
//   x:<ipHash>   blocked-until timestamp (ms), survives the daily reset

export const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
export const secondsToUtcMidnight = (now = Date.now()) => {
  const d = new Date(now);
  return Math.max(1, Math.ceil((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now) / 1000));
};

export class Guard {
  constructor(state, env) {
    this.storage = state.storage;
    this.env = env;
  }

  async rollover(now) {
    const today = utcDay(now);
    if ((await this.storage.get('day')) === today) return;
    const blocks = await this.storage.list({ prefix: 'x:' });
    await this.storage.deleteAll();
    for (const [k, until] of blocks) if (until > now) await this.storage.put(k, until);
    await this.storage.put('day', today);
  }

  async fetch(request) {
    const { op, ip } = await request.json();
    const now = Date.now();
    await this.rollover(now);
    const out = await this.handle(op, String(ip).slice(0, 64), now);
    return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
  }

  async handle(op, ip, now) {
    const blockedUntil = (await this.storage.get(`x:${ip}`)) || 0;
    if (blockedUntil > now) return { ok: false, reason: 'blocked', retryAfter: Math.ceil((blockedUntil - now) / 1000) };

    if (op === 'invalid') {
      const n = ((await this.storage.get(`b:${ip}`)) || 0) + 1;
      await this.storage.put(`b:${ip}`, n);
      if (n >= Number(this.env.MAX_INVALID || 20)) {
        const hours = Number(this.env.BLOCK_HOURS || 24);
        await this.storage.put(`x:${ip}`, now + hours * 3600e3);
        return { ok: false, reason: 'blocked', retryAfter: hours * 3600 };
      }
      return { ok: true };
    }

    if (op === 'consume') {
      const g = (await this.storage.get('g')) || 0;
      if (g >= Number(this.env.DAILY_LIMIT || 20000)) return { ok: false, reason: 'global_daily', retryAfter: secondsToUtcMidnight(now) };
      const n = (await this.storage.get(`i:${ip}`)) || 0;
      if (n >= Number(this.env.IP_DAILY_LIMIT || 600)) return { ok: false, reason: 'ip_daily', retryAfter: secondsToUtcMidnight(now) };
      await this.storage.put({ g: g + 1, [`i:${ip}`]: n + 1 });
      return { ok: true, used: n + 1 };
    }

    return { ok: false, reason: 'bad_op' };
  }
}
