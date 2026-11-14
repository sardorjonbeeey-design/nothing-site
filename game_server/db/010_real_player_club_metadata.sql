-- New club onboarding: managers recruit their own team before league qualification.
-- Add source-club metadata for real-world player identities without conflating it with in-game ownership.
ALTER TABLE players ADD COLUMN IF NOT EXISTS real_club_name VARCHAR(100);
ALTER TABLE players ADD COLUMN IF NOT EXISTS real_club_key VARCHAR(60);
ALTER TABLE players ADD COLUMN IF NOT EXISTS real_club_crest_url TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS real_roster_source TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS real_roster_checked_at DATE;
CREATE INDEX IF NOT EXISTS players_real_club_idx ON players(real_club_key, full_name) WHERE real_club_key IS NOT NULL;
