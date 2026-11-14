-- Competition inactivity forfeits and idempotent top-three season prizes.
CREATE TABLE IF NOT EXISTS season_prize_payments (
 league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
 club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
 place INTEGER NOT NULL CHECK (place BETWEEN 1 AND 3),
 amount_uzs BIGINT NOT NULL CHECK (amount_uzs >= 0),
 paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY (league_id,club_id)
);
CREATE INDEX IF NOT EXISTS season_prize_payments_club_idx ON season_prize_payments(club_id,paid_at DESC);

CREATE TABLE IF NOT EXISTS owner_activity_events (
 id BIGSERIAL PRIMARY KEY,
 user_id UUID NOT NULL REFERENCES game_users(id) ON DELETE CASCADE,
 activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS owner_activity_user_time_idx ON owner_activity_events(user_id,activity_at DESC);
-- Preserve the most recent authenticated login as the initial activity checkpoint for existing owners.
INSERT INTO owner_activity_events(user_id,activity_at)
 SELECT id,last_seen_at FROM game_users WHERE last_seen_at IS NOT NULL
 ON CONFLICT DO NOTHING;
