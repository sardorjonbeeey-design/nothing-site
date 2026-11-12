-- Rating profiles: per-category rating limits, enforced for every player row by a trigger.
-- A future category is added with one INSERT into rating_profiles; no constraint or function has to change.
CREATE TABLE IF NOT EXISTS rating_profiles (
 category VARCHAR(30) PRIMARY KEY, min_overall SMALLINT NOT NULL, max_overall SMALLINT NOT NULL,
 max_potential SMALLINT NOT NULL, max_attribute SMALLINT NOT NULL,
 CHECK (min_overall >= 1 AND max_overall >= min_overall AND max_potential >= max_overall AND max_attribute >= max_overall)
);
INSERT INTO rating_profiles(category,min_overall,max_overall,max_potential,max_attribute)
VALUES('uzbek_league',40,90,90,99) ON CONFLICT (category) DO NOTHING;
ALTER TABLE players ADD COLUMN IF NOT EXISTS category VARCHAR(30) NOT NULL DEFAULT 'uzbek_league';
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_category_fkey;
ALTER TABLE players ADD CONSTRAINT players_category_fkey FOREIGN KEY (category) REFERENCES rating_profiles(category);
-- Stop before changing anything if an existing player is rated outside his profile.
DO $$ DECLARE bad INTEGER; BEGIN
 SELECT COUNT(*) INTO bad FROM players p JOIN rating_profiles r ON r.category=p.category WHERE p.overall NOT BETWEEN r.min_overall AND r.max_overall;
 IF bad>0 THEN RAISE EXCEPTION 'Migration 006 requires every player overall inside its rating profile; % row(s) are outside', bad; END IF;
END $$;
-- Potential above the profile maximum is lowered to it. Nothing else on the row is touched.
UPDATE players p SET potential=r.max_potential FROM rating_profiles r WHERE r.category=p.category AND p.potential>r.max_potential;
-- The fixed 1-100 column checks give way to the profile trigger; potential may still never be below overall.
DO $$ DECLARE c RECORD; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='players'::regclass AND contype='c'
  AND (pg_get_constraintdef(oid) ILIKE '%overall%' OR pg_get_constraintdef(oid) ILIKE '%potential%') LOOP
  EXECUTE format('ALTER TABLE players DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
ALTER TABLE players ADD CONSTRAINT players_potential_not_below_overall CHECK (potential >= overall);
CREATE OR REPLACE FUNCTION enforce_player_rating_profile() RETURNS trigger AS $$
DECLARE r rating_profiles%ROWTYPE; k TEXT;
BEGIN
 SELECT * INTO r FROM rating_profiles WHERE category=NEW.category;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown player category %',NEW.category USING ERRCODE='check_violation'; END IF;
 IF NEW.overall NOT BETWEEN r.min_overall AND r.max_overall THEN
  RAISE EXCEPTION 'Overall % is outside %-% for %',NEW.overall,r.min_overall,r.max_overall,r.category USING ERRCODE='check_violation';
 END IF;
 IF NEW.potential>r.max_potential THEN
  RAISE EXCEPTION 'Potential % is above % for %',NEW.potential,r.max_potential,r.category USING ERRCODE='check_violation';
 END IF;
 FOREACH k IN ARRAY ARRAY['pace','shooting','passing','dribbling','defending','physical'] LOOP
  IF jsonb_typeof(NEW.attributes->k) IS DISTINCT FROM 'number' OR (NEW.attributes->>k)::numeric NOT BETWEEN 1 AND r.max_attribute THEN
   RAISE EXCEPTION 'Attribute % is outside 1-% for %',k,r.max_attribute,r.category USING ERRCODE='check_violation';
  END IF;
 END LOOP;
 RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS players_rating_profile ON players;
CREATE TRIGGER players_rating_profile BEFORE INSERT OR UPDATE OF overall,potential,category,attributes ON players
 FOR EACH ROW EXECUTE FUNCTION enforce_player_rating_profile();
