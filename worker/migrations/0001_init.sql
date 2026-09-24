-- Anonymous gameplay events (see shared/telemetry.js). No IP, account or device data.
CREATE TABLE IF NOT EXISTS events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  day       TEXT    NOT NULL,             -- UTC date only (no time of day)
  match_id  TEXT    NOT NULL,             -- random id generated in the browser per match
  research  INTEGER NOT NULL,             -- 1 = player opted in to research use
  lang      TEXT    NOT NULL,
  app_ver   TEXT    NOT NULL,
  game      TEXT    NOT NULL,
  game_ver  TEXT    NOT NULL,
  mode      TEXT    NOT NULL,             -- hinted | raw | practice
  kind      TEXT    NOT NULL,             -- move | end
  actor     TEXT,                         -- human | jev | bot
  model     TEXT,                         -- Jev model version, e.g. jev-1.13.0
  phase     TEXT,
  act       TEXT    NOT NULL,
  detail    TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_game_day ON events (game, day);
CREATE INDEX IF NOT EXISTS idx_events_match ON events (match_id);

-- Running totals for the public insights page (so /stats never scans the events table).
CREATE TABLE IF NOT EXISTS agg (
  game     TEXT NOT NULL,
  game_ver TEXT NOT NULL,
  mode     TEXT NOT NULL,
  actor    TEXT NOT NULL,                 -- human | jev | bot | '' (match results)
  model    TEXT NOT NULL,
  kind     TEXT NOT NULL,
  phase    TEXT NOT NULL,
  act      TEXT NOT NULL,
  detail   TEXT NOT NULL,
  n        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (game, game_ver, mode, actor, model, kind, phase, act, detail)
);
