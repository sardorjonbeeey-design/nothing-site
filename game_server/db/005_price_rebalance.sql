-- Rebalance player market values to 11M UZS at OVR 80 with a 1.112 multiplier per OVR.
-- This updates existing players as well as values that were set by migration 004.
UPDATE players
SET market_value_uzs=(ROUND(11000000*POWER(1.112::numeric,overall-80)/10000)*10000)::bigint;
