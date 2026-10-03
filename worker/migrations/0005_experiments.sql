-- Keep all old rows explicitly in the legacy cohort.
ALTER TABLE events ADD COLUMN experiment TEXT NOT NULL DEFAULT '1';
ALTER TABLE events ADD COLUMN variant TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE events ADD COLUMN opponent TEXT NOT NULL DEFAULT 'jev';
ALTER TABLE events ADD COLUMN assignment_source TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE events ADD COLUMN assignment_id TEXT;
ALTER TABLE events ADD COLUMN batch_id TEXT;
ALTER TABLE events ADD COLUMN batch_seq INTEGER;
CREATE UNIQUE INDEX idx_event_delivery ON events(batch_id, batch_seq);
CREATE TABLE log_batches (batch_id TEXT PRIMARY KEY);
CREATE TABLE experiment_matches (
  match_id TEXT PRIMARY KEY, experiment TEXT NOT NULL, game TEXT NOT NULL,
  opponent TEXT NOT NULL, mode TEXT NOT NULL, variant TEXT NOT NULL,
  policy TEXT NOT NULL, assignment_source TEXT NOT NULL, mixed INTEGER NOT NULL,
  assignment_id TEXT, result TEXT NOT NULL, human_score REAL, opponent_score REAL, day TEXT NOT NULL
);
CREATE INDEX idx_experiment_balance ON experiment_matches(experiment,game,mixed,assignment_source);
CREATE TABLE agg_v2 (
  experiment TEXT NOT NULL, game TEXT NOT NULL, game_ver TEXT NOT NULL,
  variant TEXT NOT NULL, opponent TEXT NOT NULL, assignment_source TEXT NOT NULL,
  mode TEXT NOT NULL, policy TEXT NOT NULL, actor TEXT NOT NULL, model TEXT NOT NULL,
  kind TEXT NOT NULL, phase TEXT NOT NULL, act TEXT NOT NULL, detail TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(experiment,game,game_ver,variant,opponent,assignment_source,mode,policy,actor,model,kind,phase,act,detail)
);
ALTER TABLE events ADD COLUMN human_score REAL;
ALTER TABLE events ADD COLUMN opponent_score REAL;
