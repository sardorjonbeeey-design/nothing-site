-- League scheduling (20:00 Asia/Tashkent, 60-second matches), friendlies and server-side result views.
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS starts_on DATE;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS kind VARCHAR(10) NOT NULL DEFAULT 'league';
ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS day_number INTEGER;
ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS kickoff_at TIMESTAMPTZ;
ALTER TABLE fixtures ALTER COLUMN league_id DROP NOT NULL;
ALTER TABLE fixtures ALTER COLUMN round_number DROP NOT NULL;
ALTER TABLE fixtures DROP CONSTRAINT IF EXISTS fixtures_status_check;
ALTER TABLE fixtures ADD CONSTRAINT fixtures_status_check CHECK (status IN ('scheduled','played','cancelled'));
ALTER TABLE fixtures DROP CONSTRAINT IF EXISTS fixtures_kind_check;
ALTER TABLE fixtures ADD CONSTRAINT fixtures_kind_check CHECK (
 (kind='league' AND league_id IS NOT NULL AND round_number IS NOT NULL) OR
 (kind='friendly' AND league_id IS NULL AND round_number IS NULL AND kickoff_at IS NOT NULL)
);
-- Leagues created by the earlier manual-play prototype have no schedule: close them so they are never auto-settled.
UPDATE fixtures SET status='cancelled' WHERE status='scheduled' AND kickoff_at IS NULL;
UPDATE leagues SET status='completed',completed_at=NOW() WHERE status='active' AND starts_on IS NULL;
CREATE INDEX IF NOT EXISTS fixtures_due_idx ON fixtures(kickoff_at) WHERE status='scheduled';
CREATE INDEX IF NOT EXISTS fixtures_home_kickoff_idx ON fixtures(home_club_id,kickoff_at DESC);
CREATE INDEX IF NOT EXISTS fixtures_away_kickoff_idx ON fixtures(away_club_id,kickoff_at DESC);
CREATE TABLE IF NOT EXISTS friendly_requests (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 from_club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
 to_club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
 proposed_kickoff_at TIMESTAMPTZ NOT NULL,
 status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled','expired')),
 fixture_id UUID REFERENCES fixtures(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), responded_at TIMESTAMPTZ,
 CHECK (from_club_id <> to_club_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS friendly_requests_pending_unique ON friendly_requests(from_club_id,to_club_id,proposed_kickoff_at) WHERE status='pending';
CREATE INDEX IF NOT EXISTS friendly_requests_to_idx ON friendly_requests(to_club_id,status);
CREATE INDEX IF NOT EXISTS friendly_requests_from_idx ON friendly_requests(from_club_id,status);
CREATE TABLE IF NOT EXISTS fixture_result_views (
 club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
 fixture_id UUID NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
 viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY (club_id,fixture_id)
);
