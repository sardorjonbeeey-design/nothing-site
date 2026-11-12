CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS game_users (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), telegram_user_id TEXT NOT NULL UNIQUE,
 username TEXT, first_name TEXT, last_name TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS clubs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id UUID NOT NULL REFERENCES game_users(id) ON DELETE CASCADE,
 name VARCHAR(28) NOT NULL, short_name VARCHAR(5) NOT NULL, primary_colour CHAR(7) NOT NULL DEFAULT '#167A55',
 secondary_colour CHAR(7) NOT NULL DEFAULT '#F0C75E', crest_url TEXT,
 budget_uzs BIGINT NOT NULL DEFAULT 0 CHECK (budget_uzs >= 0),
 development_points INTEGER NOT NULL DEFAULT 0 CHECK (development_points >= 0), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS clubs_owner_idx ON clubs(owner_user_id);
CREATE TABLE IF NOT EXISTS players (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
 full_name VARCHAR(60) NOT NULL, nationality CHAR(2) NOT NULL DEFAULT 'UZ',
 age SMALLINT NOT NULL CHECK (age BETWEEN 16 AND 40),
 position VARCHAR(3) NOT NULL CHECK (position IN ('GK','CB','LB','RB','DM','CM','AM','LW','RW','ST')),
 quality VARCHAR(20) NOT NULL CHECK (quality IN ('academy','developing','established','elite')),
 overall SMALLINT NOT NULL CHECK (overall BETWEEN 1 AND 100), potential SMALLINT NOT NULL CHECK (potential BETWEEN overall AND 100),
 attributes JSONB NOT NULL, market_value_uzs BIGINT NOT NULL CHECK (market_value_uzs >= 0), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS players_club_idx ON players(club_id);
CREATE INDEX IF NOT EXISTS players_market_idx ON players(club_id, overall);
CREATE TABLE IF NOT EXISTS lineups (
 club_id UUID PRIMARY KEY REFERENCES clubs(id) ON DELETE CASCADE,
 formation VARCHAR(8) NOT NULL DEFAULT '4-3-3', starters UUID[] NOT NULL DEFAULT '{}',
 substitutes UUID[] NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS money_ledger (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
 amount_uzs BIGINT NOT NULL, balance_after_uzs BIGINT NOT NULL CHECK (balance_after_uzs >= 0),
 reason VARCHAR(40) NOT NULL, reference_id UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS money_ledger_club_idx ON money_ledger(club_id, created_at DESC);
CREATE TABLE IF NOT EXISTS missions (
 id VARCHAR(40) PRIMARY KEY, title VARCHAR(80) NOT NULL, description VARCHAR(180) NOT NULL,
 metric VARCHAR(30) NOT NULL, target INTEGER NOT NULL CHECK (target > 0),
 reward_dp INTEGER NOT NULL CHECK (reward_dp > 0), cadence VARCHAR(12) NOT NULL DEFAULT 'season', active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS club_missions (
 club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
 mission_id VARCHAR(40) NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
 progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0), completed_at TIMESTAMPTZ, claimed_at TIMESTAMPTZ,
 PRIMARY KEY (club_id, mission_id)
);
CREATE TABLE IF NOT EXISTS leagues (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(80) NOT NULL,
 season_number INTEGER NOT NULL DEFAULT 1, status VARCHAR(12) NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS league_members (
 league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE, club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
 played INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, draws INTEGER NOT NULL DEFAULT 0,
 losses INTEGER NOT NULL DEFAULT 0, goals_for INTEGER NOT NULL DEFAULT 0, goals_against INTEGER NOT NULL DEFAULT 0,
 points INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (league_id, club_id)
);
CREATE TABLE IF NOT EXISTS fixtures (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
 round_number INTEGER NOT NULL, home_club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
 away_club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
 status VARCHAR(12) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','played')),
 home_goals SMALLINT, away_goals SMALLINT, events JSONB, played_at TIMESTAMPTZ,
 CHECK (home_club_id <> away_club_id), UNIQUE (league_id, round_number, home_club_id, away_club_id)
);
CREATE INDEX IF NOT EXISTS fixtures_home_idx ON fixtures(home_club_id, status);
CREATE INDEX IF NOT EXISTS fixtures_away_idx ON fixtures(away_club_id, status);
CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(80) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
