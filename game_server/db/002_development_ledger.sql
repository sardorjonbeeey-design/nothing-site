CREATE TABLE IF NOT EXISTS development_ledger (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
 amount_dp INTEGER NOT NULL,
 balance_after_dp INTEGER NOT NULL CHECK (balance_after_dp >= 0),
 reason VARCHAR(40) NOT NULL,
 reference_id UUID,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS development_ledger_club_idx ON development_ledger(club_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS players_full_name_unique ON players(full_name);
CREATE INDEX IF NOT EXISTS players_free_market_idx ON players(overall DESC,full_name) WHERE club_id IS NULL;
