-- Remove the unapproved real-player catalogue before any further public use.
-- Players already signed by managers keep their player IDs and football attributes, but become clearly fictional prospects.
WITH assigned AS (
  SELECT id,ROW_NUMBER() OVER (ORDER BY id) AS row_number
  FROM players
  WHERE catalog_key LIKE 'real-superleague-2026-%' AND club_id IS NOT NULL
)
UPDATE players p
SET full_name='Zamin Prospect '||LPAD(assigned.row_number::text,3,'0'),
    nationality='UZ',
    catalog_key='fictional-owned-'||p.id::text,
    real_player_dob=NULL,
    real_club_name=NULL,
    real_club_key=NULL,
    real_club_crest_url=NULL,
    real_roster_source=NULL,
    real_roster_checked_at=NULL
FROM assigned
WHERE p.id=assigned.id;

-- Unsigned real-player records are removed entirely from the live market.
DELETE FROM players WHERE catalog_key LIKE 'real-superleague-2026-%';

DROP INDEX IF EXISTS players_real_club_idx;
DROP INDEX IF EXISTS players_real_player_dob_idx;
ALTER TABLE players DROP COLUMN IF EXISTS real_player_dob;
ALTER TABLE players DROP COLUMN IF EXISTS real_club_name;
ALTER TABLE players DROP COLUMN IF EXISTS real_club_key;
ALTER TABLE players DROP COLUMN IF EXISTS real_club_crest_url;
ALTER TABLE players DROP COLUMN IF EXISTS real_roster_source;
ALTER TABLE players DROP COLUMN IF EXISTS real_roster_checked_at;

-- Telegram notifications are opt-in; /start in the private game bot enables them.
ALTER TABLE game_users
  ADD COLUMN IF NOT EXISTS telegram_notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS fixture_notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id UUID NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES game_users(id) ON DELETE CASCADE,
  notification_type VARCHAR(24) NOT NULL CHECK (notification_type IN ('kickoff_1h','match_result','forfeit_warning_24h','forfeit_warning_2h')),
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fixture_id,user_id,notification_type)
);
CREATE INDEX IF NOT EXISTS fixture_notifications_user_idx
  ON fixture_notification_deliveries(user_id,delivered_at DESC);

CREATE TABLE IF NOT EXISTS club_inactivity_graces (
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fixture_id UUID REFERENCES fixtures(id) ON DELETE SET NULL,
  PRIMARY KEY (league_id,club_id)
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES game_users(id) ON DELETE SET NULL,
  club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
  event_name VARCHAR(48) NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS analytics_events_created_idx ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_name_idx ON analytics_events(event_name,created_at DESC);

-- Stable invite codes and opt-in notification preferences for Telegram-first growth.
ALTER TABLE game_users
  ADD COLUMN IF NOT EXISTS referral_code VARCHAR(12);
UPDATE game_users
SET referral_code=UPPER(SUBSTRING(ENCODE(GEN_RANDOM_BYTES(6),'hex') FROM 1 FOR 10))
WHERE referral_code IS NULL;
ALTER TABLE game_users
  ALTER COLUMN referral_code SET DEFAULT UPPER(SUBSTRING(ENCODE(GEN_RANDOM_BYTES(6),'hex') FROM 1 FOR 10)),
  ALTER COLUMN referral_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS game_users_referral_code_idx ON game_users(referral_code);

CREATE TABLE IF NOT EXISTS telegram_notification_preferences (
  telegram_user_id TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS pending_referrals (
  referred_telegram_user_id TEXT PRIMARY KEY,
  referrer_user_id UUID NOT NULL REFERENCES game_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS referrals (
  referred_user_id UUID PRIMARY KEY REFERENCES game_users(id) ON DELETE CASCADE,
  referrer_user_id UUID NOT NULL REFERENCES game_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (referred_user_id <> referrer_user_id)
);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals(referrer_user_id,created_at DESC);
