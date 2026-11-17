-- Two divisions per season: the main league (10-18 clubs) and a second league (5-18 clubs).
-- Each season the bottom 3 of the main league drop to the second league and the top 3 of the second league rise.
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS division SMALLINT NOT NULL DEFAULT 1 CHECK (division IN (1,2));
DROP INDEX IF EXISTS leagues_season_unique;
CREATE UNIQUE INDEX IF NOT EXISTS leagues_division_season_unique ON leagues(division,season_number) WHERE starts_on IS NOT NULL;
