-- Sole-owner administration: server-gated admin audit, entitlements, and competition settings.
CREATE TABLE IF NOT EXISTS admin_audit_log (
 id BIGSERIAL PRIMARY KEY,
 actor_user_id UUID NOT NULL REFERENCES game_users(id),
 actor_telegram_user_id TEXT NOT NULL,
 target_type VARCHAR(40) NOT NULL,
 target_id TEXT NOT NULL,
 action VARCHAR(60) NOT NULL,
 before_after JSONB NOT NULL,
 reason VARCHAR(500) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_target_idx ON admin_audit_log(target_type,target_id,created_at DESC);
CREATE TABLE IF NOT EXISTS user_entitlements (
 user_id UUID NOT NULL REFERENCES game_users(id) ON DELETE CASCADE,
 feature VARCHAR(20) NOT NULL CHECK (feature IN ('gold','vip')),
 granted_by UUID NOT NULL REFERENCES game_users(id),
 reason VARCHAR(500) NOT NULL,
 granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 revoked_at TIMESTAMPTZ,
 revoked_by UUID REFERENCES game_users(id),
 revoke_reason VARCHAR(500),
 PRIMARY KEY(user_id,feature)
);
CREATE TABLE IF NOT EXISTS competition_settings (
 setting_key VARCHAR(80) PRIMARY KEY,
 setting_value JSONB NOT NULL,
 updated_by UUID NOT NULL REFERENCES game_users(id),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 reason VARCHAR(500) NOT NULL
);
