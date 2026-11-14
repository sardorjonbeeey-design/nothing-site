# Current Status

Last updated: 2026-11-14
Repository: sardorjonbeeey-design/nothing-site
Branch: zamin-management-isolated
Phase: Phase 3A formation matchup model implemented and CI verified; balance review remains
Production connection: NONE
Integration approval: NOT GRANTED

## What exists
- prototype/ — original browser-only club-setup demo (localStorage). Superseded by game_client/. IMPLEMENTED / UNVERIFIED.
- game_server/ — Node.js API and PostgreSQL schema: auth, clubs, squad, lineup, transfers, upgrades, missions, league, fixtures, match simulation.
- game_client/ — mobile-first single-page client served by the game server.
- game_server/deploy/ — Docker, Caddy and cloud guides. NOT EXECUTED.

## Verification (2026-11-12, local only)
VERIFIED locally against a throwaway local PostgreSQL, with mock/dev authentication:
- Previous checkpoint (commit 978bf21) had unit 44 passed, integration 32 subtests passed, mobile emulation 123 checks passed.
- The subsequent price-curve rebalancing changed price assertions and added migration 005; rerun all suites before treating those results as current.
Details, untested areas and limitations: game_server/VERIFICATION_STATUS.md.

NOT verified: real-time kick-offs and seasons, real phone, real Telegram, Docker/Caddy, hosted database, load and security.

## League and matches (IMPLEMENTED, owner-approved rules)
- 10-club double round-robin: 18 rounds on matchdays 1–9 and 11–19, rest day on day 10, 19 calendar days.
- All five fixtures of a matchday kick off at 20:00 Asia/Tashkent, last 60 seconds and are settled by the server's own scheduler at 20:01. Users cannot start, delay, accelerate, replay or settle matches.
- Friendlies: challenge with a proposed time, accept or decline; one-minute slots; never affect the league.
- Opening the game shows the latest completed match first; result history and viewed state are stored server-side.
- Next season starts automatically two rest days after day 19 with the same ten clubs; everything a club owns is kept.
- Match model: rating difference on an Elo-style curve, scale 40, home advantage +2.

## Economy (IMPLEMENTED, owner-approved rules)
- One club per user. 20,000,000 UZS and an identical 18-player generated academy squad.
- Rebalanced price 11,000,000 × 1.112^(OVR − 80), rounded to 10,000 UZS. Academy first sale 50%, otherwise 80%. Squad 13–26.
- 750,000 UZS per completed league match; the same stipend per league matchday for clubs outside the league.
- The market always offers generated 45–50 players. Sold starters are replaced in the XI automatically.
- All players are fictional. The real-player database is NOT implemented.

## Next steps (PROPOSED, awaiting owner)
1. Real-player database: resolve data rights and source access first.
2. How waiting clubs enter a league (second league or promotion).
3. A running cost such as wages before cash piles up over several seasons.
4. Remaining provisional items in game_server/OPEN_DECISIONS.md.

## Boundaries
Do not connect the live Telegram Mini App, live bot, existing backend, production or Neon database, supporter economy or existing community systems. No merge, deployment or integration without explicit owner approval.


## Phase 2 — Core Game Loop (2026-11-13)
- Phase 1 (12 formations) is committed on `claude/gallant-clarke-tqser8` at `6497bf73c80473782910691c525c48d39eaa6e2c`.
- Phase 2A audit: the server-side match, settlement, result, standings and season loop already exists.
- Phase 2B: branch `phase-2-core-loop` adds a dashboard next-match panel and visible-page automatic refresh; new unviewed results open after refresh.
- Static syntax and mocked client-flow checks passed. Phase 2C was later completed per owner report: 73 passed, 0 failed, 1 skipped; 36/36 integration; 147/147 mobile smoke.
- No merge, deployment, production connection, database change, match-engine change or economy change.


## Phase 2 completion checkpoint — owner-reported (2026-11-14)
- Phase 1: 12 formation options and lineup selection.
- Phase 2A: existing automatic match and season settlement audited.
- Phase 2B: dashboard next-match panel and automatic refresh added.
- Phase 2C results supplied by owner: `npm test` — 73 passed, 0 failed, 1 skipped; integration — 36/36 passed; mobile smoke — 147/147 passed.
- These Phase 2C figures are owner-reported and were not independently rerun during the Phase 3 session.

## Phase 3A — formation matchup model (2026-11-14)
- Created `zamin-management-isolated` from Phase 2 commit `76ac42a53ea142b4f6e743423b926b7996fff6d8`.
- Added `game_server/src/formation-tactics.js` and integrated its relative matchup adjustment into `game_server/src/simulation.js`.
- Added `game_server/test/formation-tactics.test.js`; updated formation simulation tests to use actual positional attributes and test all-pairs balance.
- Model uses role suitability plus attribute surplus/deficit relative to OVR across defence, midfield, width, attack and transitions. It does not double-count raw OVR.
- Proposed tactical coefficients and the 1.5-point total matchup cap are not separately owner-approved final balance decisions.
- GitHub Actions run `43515953300` passed: `npm test` — 80 tests, 79 passed, 0 failed, 1 skipped; PostgreSQL integration — 36/36 passed. The 12-formation matchup and all-pairs balance tests passed.
- Fixed the pre-existing scheduler shutdown race: scheduler stop waits for an active tick, and server shutdown awaits it before closing the database pool.
- A full-season simulation with realistic league squads and a mobile smoke run on this Phase 3 branch remain outstanding.
- No merge, deployment, production database, live Mini App or bot connection.
## Phase 3C — sole-owner super-admin (2026-11-14) — IMPLEMENTED, CI VERIFIED
- Separate /admin dashboard served by the isolated game server; Telegram login uses the existing signed session.
- Server authorization requires the exact SUPER_ADMIN_TELEGRAM_ID; production config validates it is numeric and fails closed when unset. No public registration or multi-admin workflow.
- Admin capabilities: inspect clubs/users/players; ledgered UZS budget adjustments; player gifts with squad-bound validation and transactional lineup repair; Gold/VIP grant/revoke and user-facing active-entitlement API; persistent JSON competition settings.
- Migration 008 creates admin audit, entitlement and settings tables. Audit entries store actor Telegram ID, target, action, time, before/after JSON and required reason; DB trigger enforces append-only.
- Integration tests cover owner/non-owner authorization, funds ledger, Gold grant/revoke and entitlement access, competition settings, player gift and lineup integrity, required reason, negative budget protection and audit immutability.
- GitHub Actions run 43587396857 passed: 88 passed, 0 failed, 1 skipped; PostgreSQL integration 38/38 passed. A follow-up test for production Telegram ID config validation is running on the latest commit.
- No merge, deployment, production DB, live Mini App or bot connection.

## Remaining Phase 3 work
1. Re-run pending price-rebalance migrations/full suite; review proposed formation tactical coefficients and run longer full-season balance simulations with realistic squads.
2. Finalize inactivity-forfeit edge cases, top-three prize amounts and tie-break policy.
3. Implement approved match bonuses and finalized inactivity/season rewards.
4. Run adversarial tests for concurrent transfers, duplicate rewards, scheduler restarts, inactivity and economy balance.
