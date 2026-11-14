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
