-- Anonymous per-browser player id (random; not linked to any identity).
ALTER TABLE events ADD COLUMN player_id TEXT;
CREATE INDEX IF NOT EXISTS idx_events_player ON events (player_id);

-- One small row per player, so the insights page can count players without scanning events.
CREATE TABLE IF NOT EXISTS players (
  player_id TEXT PRIMARY KEY,
  first_day TEXT NOT NULL,
  last_day  TEXT NOT NULL,
  days      INTEGER NOT NULL DEFAULT 1,   -- distinct UTC days with activity
  matches   INTEGER NOT NULL DEFAULT 0,   -- finished matches
  moves     INTEGER NOT NULL DEFAULT 0    -- the player's own moves
);
