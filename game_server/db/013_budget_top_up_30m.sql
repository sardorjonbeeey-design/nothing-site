-- One-time top-up to the 30,000,000 UZS starting budget. Every club that started with 20,000,000 UZS and has
-- spent X so far has 20,000,000 - X; adding 10,000,000 makes it 30,000,000 - X. Idempotent: a club that already
-- has this ledger reason is skipped, so re-running the migration never adds money twice.
WITH targets AS (
  SELECT c.id FROM clubs c
  WHERE NOT EXISTS (SELECT 1 FROM money_ledger m WHERE m.club_id = c.id AND m.reason = 'budget_top_up_30m')
  FOR UPDATE
), updated AS (
  UPDATE clubs c SET budget_uzs = c.budget_uzs + 10000000
  FROM targets t WHERE c.id = t.id
  RETURNING c.id, c.budget_uzs
)
INSERT INTO money_ledger (club_id, amount_uzs, balance_after_uzs, reason)
SELECT id, 10000000, budget_uzs, 'budget_top_up_30m' FROM updated;
