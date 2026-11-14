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
- GitHub Actions run 43587396857 passed: 88 passed, 0 failed, 1 skipped; PostgreSQL integration 38/38 passed. Follow-up CI run 43587550239 also passed, including production Telegram ID config validation: 88 passed, 0 failed, 1 skipped; PostgreSQL integration 38/38 passed.
- No merge, deployment, production DB, live Mini App or bot connection.

## Phase 3D — competition rules, rewards and adversarial verification (2026-11-14)
- Implemented migration 009: append-only owner activity event history plus unique season prize payment records. Readiness now requires both new tables.
- Only successful authenticated state-changing POST requests count as owner activity. Passive GET, dashboard refresh and rejected requests do not. Activity is evaluated at scheduled kick-off; later actions cannot undo a forfeit.
- In-app warning at 24h idle and final warning at 46h idle. One inactive owner loses 0–3; if both are inactive, result is 0–0, both record a loss, neither gets points or a match-result bonus.
- Match result bonuses: win 250,000 UZS; draw 100,000 UZS each; loss 0. These are additional to 750,000 UZS league income. Double inactivity forfeit pays no result bonus.
- Season prizes: 1st 10,000,000 UZS; 2nd 7,000,000 UZS; 3rd 5,000,000 UZS. Tie-breaks: points, GD, GF, head-to-head points, head-to-head GD. Remaining ties share occupied top-three prize slots equally; payout is idempotent.
- Added tests for warning thresholds, single/double forfeits, result bonus ledger entries, 22M UZS prize pool, tie splits, scheduler-restart duplicate protection, concurrent transfer double-buy, concurrent buyer overspend, cancel-vs-buy races, and 120 full 10-club seasons using balanced 18-player squads.
- Latest successful CI run after all concurrency tests: 43590913933 — 93 passed, 0 failed, 1 skipped; PostgreSQL integration 40/40 passed.
- All work remains on zamin-management-isolated; no merge, deployment, production DB, bot or live Mini App connection.
- Admin access remains closed until isolated runtime has SUPER_ADMIN_TELEGRAM_ID set to the owner's numeric Telegram user ID and migration 008_super_admin.sql is applied. Migration 009_competition_rewards.sql is also required for these competition features.
- A separate Phase 3 iPhone/Telegram mobile smoke run has not been performed. Phase 2 mobile smoke figures were owner-reported.

## Remaining Phase 3 work
- Before release, run the mobile smoke test in the isolated runtime and review the still-proposed formation coefficients. No deployment is authorized.

## Season redesign and real-player safeguards (2026-11-14) — IMPLEMENTED, LOCALLY VERIFIED
- Client: four bottom destinations (Match, Squad, Transfers, Season); match home; full-screen replay of settled matches and of a one-minute sample; squad starting XI on a pitch; Season segments (Table, Fixtures and results, Objectives, Challenges); Telegram Main Button on the sample full-time card.
- Server: goals name scorer and assist; each settled fixture stores its Starting XIs (migration 012_match_lineups.sql); GET /api/demo-match runs an in-memory sample and stores nothing.
- Real players: REAL_PLAYERS_ENABLED switch (default on; set false until written permission exists); club crests are no longer served; unofficial notice in the market; dates of birth are never returned by the API.
- Verified locally: npm test 98 passed, 0 failed, 1 skipped; integration 37 passed, 3 failed (two checks fail on the original commit as well; the third is a consequence of the same test-state issue, not a regression); browser replay of a stored settled match: 22 players on pitch, correct score, all events, no console errors.
- Not done: production deploy and migration 012 (requires owner approval); real iPhone/Telegram test; lineup editor on the pitch; Transfers and Objectives layout redesign; sound.
- Known test-state issues (pre-existing): integration check 20 expects an 18-player squad but earlier subtests leave 19; check 12 finds no lineup replacement for its squad.
