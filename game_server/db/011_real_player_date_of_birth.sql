ALTER TABLE players ADD COLUMN IF NOT EXISTS real_player_dob DATE;
CREATE INDEX IF NOT EXISTS players_real_player_dob_idx ON players(real_player_dob) WHERE real_player_dob IS NOT NULL;
