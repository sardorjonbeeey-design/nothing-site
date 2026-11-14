-- Peer-to-peer transfer market. Isolated management-game schema only.
CREATE TABLE player_transfer_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id),
  seller_club_id UUID NOT NULL REFERENCES clubs(id),
  asking_price_uzs BIGINT NOT NULL CHECK (asking_price_uzs > 0),
  status VARCHAR(16) NOT NULL DEFAULT 'listed' CHECK (status IN ('listed','sold','cancelled')),
  listed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  buyer_club_id UUID REFERENCES clubs(id),
  CONSTRAINT listing_close_state CHECK (
    (status='listed' AND closed_at IS NULL AND buyer_club_id IS NULL) OR
    (status='sold' AND closed_at IS NOT NULL AND buyer_club_id IS NOT NULL) OR
    (status='cancelled' AND closed_at IS NOT NULL AND buyer_club_id IS NULL)
  )
);
CREATE UNIQUE INDEX one_active_listing_per_player
  ON player_transfer_listings(player_id) WHERE status='listed';
CREATE INDEX active_player_transfer_listings_order
  ON player_transfer_listings(listed_at,id) WHERE status='listed';

CREATE TABLE player_transfer_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL UNIQUE REFERENCES player_transfer_listings(id),
  player_id UUID NOT NULL REFERENCES players(id),
  seller_club_id UUID NOT NULL REFERENCES clubs(id),
  buyer_club_id UUID NOT NULL REFERENCES clubs(id),
  price_uzs BIGINT NOT NULL CHECK (price_uzs > 0),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent the existing sell-to-market endpoint from taking a player out of a club
-- while the player is listed in the peer-to-peer market. A successful P2P purchase
-- first closes the listing, then transfers ownership inside the same transaction.
CREATE OR REPLACE FUNCTION prevent_transfer_of_listed_player() RETURNS trigger AS $$
BEGIN
  IF OLD.club_id IS NOT NULL AND NEW.club_id IS DISTINCT FROM OLD.club_id
     AND EXISTS (SELECT 1 FROM player_transfer_listings
                 WHERE player_id=OLD.id AND status='listed') THEN
    RAISE EXCEPTION 'Player has an active peer-to-peer listing'
      USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER players_active_listing_guard
  BEFORE UPDATE OF club_id ON players
  FOR EACH ROW EXECUTE FUNCTION prevent_transfer_of_listed_player();
