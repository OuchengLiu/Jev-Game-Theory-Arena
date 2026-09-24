-- The opponent's full probability distribution (and yes/no judgements) for each decision,
-- as JSON: {"pr": {"cooperate": 0.93, "defect": 0.07}, "nl": {"opp_will_cooperate": 0.61}}
ALTER TABLE events ADD COLUMN probs TEXT;
