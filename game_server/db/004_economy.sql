-- Economy v2: player classification, new price curve, one club per user, seasons and waiting-list stipends.
ALTER TABLE players ADD COLUMN IF NOT EXISTS origin VARCHAR(10) NOT NULL DEFAULT 'market';
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_origin_check;
ALTER TABLE players ADD CONSTRAINT players_origin_check CHECK (origin IN ('market','academy','generated'));
-- Academy players sell for 50% once; after that first sale they are ordinary transfer-market players (80%).
ALTER TABLE players ADD COLUMN IF NOT EXISTS first_sale_done BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE players ADD COLUMN IF NOT EXISTS catalog_key VARCHAR(40);
CREATE UNIQUE INDEX IF NOT EXISTS players_catalog_key_unique ON players(catalog_key);
-- Generated academy and youth players may share names, so names are no longer unique.
DROP INDEX IF EXISTS players_full_name_unique;
CREATE INDEX IF NOT EXISTS players_generated_free_idx ON players(position) WHERE club_id IS NULL AND origin='generated';
-- Price curve: 30,000,000 x 1.10^(overall - 80), rounded to 10,000 UZS.
UPDATE players SET market_value_uzs=(ROUND(30000000*POWER(1.10::numeric,overall-80)/10000)*10000)::bigint;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM clubs GROUP BY owner_user_id HAVING COUNT(*)>1) THEN
  RAISE EXCEPTION 'Migration 004 requires at most one club per user; remove the extra test clubs first';
 END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS clubs_one_per_owner ON clubs(owner_user_id);
-- One league lineage: each season number exists once, which makes the automatic rollover idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS leagues_season_unique ON leagues(season_number) WHERE starts_on IS NOT NULL;
-- Waiting-list stipend: one run per league matchday, one payment per club per matchday.
CREATE TABLE IF NOT EXISTS stipend_runs (
 league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE, day_number INTEGER NOT NULL,
 paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (league_id,day_number)
);
CREATE TABLE IF NOT EXISTS stipend_payments (
 league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE, day_number INTEGER NOT NULL,
 club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE, amount_uzs BIGINT NOT NULL CHECK (amount_uzs > 0),
 paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (league_id,day_number,club_id)
);
