-- Jev's play policy: 'greedy' (top-rated move) or 'sample' (drawn from its probabilities).
-- '' for practice mode and for rows recorded before policies existed.
ALTER TABLE events ADD COLUMN policy TEXT;

-- agg gets policy in its primary key, so it is rebuilt.
CREATE TABLE agg_new (
  game     TEXT NOT NULL,
  game_ver TEXT NOT NULL,
  mode     TEXT NOT NULL,
  policy   TEXT NOT NULL DEFAULT '',
  actor    TEXT NOT NULL,
  model    TEXT NOT NULL,
  kind     TEXT NOT NULL,
  phase    TEXT NOT NULL,
  act      TEXT NOT NULL,
  detail   TEXT NOT NULL,
  n        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (game, game_ver, mode, policy, actor, model, kind, phase, act, detail)
);
INSERT INTO agg_new (game, game_ver, mode, policy, actor, model, kind, phase, act, detail, n)
  SELECT game, game_ver, mode, '', actor, model, kind, phase, act, detail, n FROM agg;
DROP TABLE agg;
ALTER TABLE agg_new RENAME TO agg;
