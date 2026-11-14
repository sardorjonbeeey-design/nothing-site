-- Starting XI snapshot and scorer attribution for the match replay. Existing matches keep NULL.
ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS match_lineups JSONB;
