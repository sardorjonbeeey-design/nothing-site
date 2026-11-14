# Development History

Chronological record. Append entries; do not erase earlier history.

## 2026-11-11 — Independent memory
- Owner set a strict boundary: do not change existing code or systems; create new work only in new files or an isolated branch; do not connect it yet.
- Work continues on zamin-management-isolated.
- Owner clarified that “base” meant project memory, not technical architecture.
- Owner approved keeping written project memory independent from Telegram Mini App.
- Created this independent memory set under ZAMIN_FK_MANAGEMENT/MEMORY/.
- Existing Mini App, bot, city, stadium, supporter portal, existing economy and production database remain out of scope and disconnected.

## Earlier agreed game baseline — captured 2026-11-11
- Football club management game.
- Club identity includes name, short name, colours and optional crest upload.
- No built-in logo editor; external prompt and upload flow.
- Players have quality levels and attributes and can be upgraded.
- UZS is money; development points are separate.
- Matches and missions award development points; manager allocates a shared club balance.
- Matches use moving dots on a pitch in accelerated view.
- Match results are probabilistic and influenced mostly by squad strength.
- League activates when at least 10 clubs exist.
- Starting budget and detailed balance remain undecided.

## 2026-11-11 — Isolated game server and client (recorded retrospectively)
- An isolated Node.js game server (game_server/) and mobile client (game_client/) were added after the club-setup prototype. This was not recorded in memory at the time.

## 2026-11-11 — Move to dedicated repository
- Project moved to repository sardorjonbeeey-design/nothing-site, branch zamin-fk-management. Owner instructed that all work stays on this branch. Earlier references to branch zamin-management-isolated and the ZAMIN_FK_MANAGEMENT/ folder are historical.

## 2026-11-11 — Local verification phase
- Owner approved a verification-only phase: no production, no Neon/live database, no Telegram Mini App integration, no deployment, no new gameplay features, no design or balance changes.
- Fixed three defects: client static files returned 500; x-frame-options conflicted with the Telegram frame-ancestors policy; seed script failed on PostgreSQL.
- Added integration tests (throwaway local PostgreSQL, mock/dev authentication) and an emulated mobile browser smoke test.
- Results: unit 19 passed; integration 22 passed; mobile smoke 54 checks passed. Untested areas and known issues recorded in game_server/VERIFICATION_STATUS.md.
- Known design/balance issues were observed and deliberately left unchanged pending owner decisions.

## 2026-11-11 — League scheduling, friendlies and opening result screen
- Owner finalised the league rules: one league match per club per day at 20:00 Asia/Tashkent, 18 matchdays over 19 days with a rest day on day 10, 60-second matches settled by the server at 20:01, no user control over league matches; friendlies through an accepted challenge; the latest result shown first when the game opens.
- Implemented: migration 003, double round-robin schedule, in-process scheduler (src/matches.js), removal of the manual play route, results and viewed-state endpoints, friendly request endpoints, client fixtures/results/friendlies pages and the opening result screen.
- The single round-robin with a Play button (45 fixtures) is replaced.
- Results: unit 22 passed; integration 29 subtests passed; mobile smoke 111 checks passed. See game_server/VERIFICATION_STATUS.md.
- Provisional choices made during implementation are listed in game_server/OPEN_DECISIONS.md for owner confirmation.

## 2026-11-12 — Economy, seasons and match model
- Owner reviewed three proposals (real-player research, economy simulation, income and match-engine sensitivity) and approved: 20M budget; price 30M × 1.10^(OVR − 80); academy 50% first sale, market 80%; 750,000 UZS per league match and the same waiting-list stipend; automatic season 2 after two rest days with the same ten clubs; generated 45–50 youth supply; one club per user; automatic lineup replacement; zero-sum attribute offsets; match model S = 40 with home +2.
- Implemented: migration 004, src/economy.js, catalog.js, players.js, seasons.js, lineup.js, new match model, market and league endpoints, client changes.
- Starter squads are now generated academy players, identical for every club; nothing is taken from the market.
- Results: unit 44 passed; integration 32 subtests passed; mobile smoke 123 checks passed. Local only.
- Not done: real-player database. Research found FotMob ratings for the league, but sources could not be opened from this environment and data and name rights are unresolved.


## 2026-11-12 — Player price curve rebalanced
- Owner noted the initial curve made a 60 OVR player cost 4.46M UZS, too high against the 20M opening budget, and approved a lower curve.
- New price anchor: 11M UZS at OVR 80, with 1.112× per rating point, rounded to 10,000 UZS. Examples: OVR 60 = 1.32M, 70 = 3.8M, 80 = 11M, 90 = 31.8M.
- Added migration 005 to reprice existing database rows; updated server formula, unit/integration assertions, mobile smoke price range, balancing and status docs.
- Tests must be rerun after this change; this edit workflow did not execute the test suite.


## 2026-11-13 — Phase 2 core game loop
- Audited the Phase 1 branch. The server already connected scheduled fixtures, automatic settlement, results, standings and season progression; the client had no automatic refresh and the dashboard did not surface the next fixture.
- Created isolated branch `phase-2-core-loop` from Phase 1 commit `6497bf73c80473782910691c525c48d39eaa6e2c`.
- Updated `game_client/app.js`: dashboard next-match panel; refresh every 30 seconds only while visible; refresh on focus/visibility return; automatically show a newly arrived unviewed result.
- JavaScript syntax and mocked client-flow checks passed. Full unit, PostgreSQL integration and mobile browser tests remain pending.
- No server, schema, economy, schedule, match engine, production or deployment changes.


## 2026-11-14 — Phase 3 kickoff and formation matchup prototype
- Created `zamin-management-isolated` from the verified Phase 2 branch head `76ac42a53ea142b4f6e743423b926b7996fff6d8`. The source Phase 2 and original management branches were left untouched.
- Owner supplied the Phase 2C completion checkpoint: 73 passed / 0 failed / 1 skipped in the main suite, 36/36 integration tests, and 147/147 mobile smoke checks. Recorded as owner-reported; not independently rerun in this session.
- Added a separate formation tactical profile module and integrated a symmetric, capped matchup adjustment into match simulation. The model uses position-role fit and player attribute surplus/deficit relative to OVR, so it does not add raw squad quality a second time or award a fixed bonus for a formation name.
- Added tests for all 12 formation profiles, self-match neutrality, antisymmetry, total-field neutrality, bounded effects and preservation of a large squad-quality gap. Updated formation simulation tests for tactical matchups.
- Added an isolated unit/integration GitHub Actions workflow. No workflow run was returned/observed.
- The proposed tactical coefficients and 1.5-point maximum relative swing remain unverified balance values. Full repository tests have not been run; only a scratch Node check of the pure matchup function passed.
- Inactivity edge cases and exact season top-three prizes/tie-breaks remain OPEN. Earlier assistant suggestions (double-forfeit and 5M/3M/1.5M UZS prizes) were not owner approvals and are not implemented.
- No merge, deployment, production database, live Mini App or bot connection.


## 2026-11-14 — Phase 3A verification and scheduler shutdown fix
- Initial CI run confirmed the unit suite passed but exposed two environment/test issues: the workflow used a 127.0.0.1 PostgreSQL URL that enabled SSL in the app's DB config, and the known scheduler shutdown race.
- Changed the disposable CI database URL to `localhost`, which uses the app's existing local-PostgreSQL SSL-off path.
- Fixed scheduler lifecycle: `startScheduler().stop()` now awaits an in-flight tick; server shutdown awaits scheduler stop before closing the pool.
- Final GitHub Actions run `43515953300` completed successfully: main suite 80 tests (79 passed, 0 failed, 1 skipped); PostgreSQL integration 36/36 passed.
- New 12-formation profile tests and all-pairs balance tests passed. This does not replace a longer full-season simulation with realistic squads.
- No merge, deployment, production database, live Mini App or bot connection.


## 2026-11-14 — Phase 3A CI verification and scheduler shutdown fix
- Initial CI exposed a PostgreSQL SSL-mode mismatch in the workflow URL and the pre-existing scheduler shutdown race. The disposable CI URL now uses `localhost`, matching the app's local-PostgreSQL SSL-off rule.
- Fixed scheduler lifecycle: `startScheduler().stop()` awaits an in-flight tick; server shutdown awaits scheduler stop before closing the database pool.
- Final GitHub Actions run `43515953300` completed successfully: `npm test` — 80 tests, 79 passed, 0 failed, 1 skipped; PostgreSQL integration — 36/36 passed.
- The new 12-formation profile, matchup, antisymmetry and all-pairs balance tests passed.
- Full-season balance with realistic league squads and mobile smoke on this Phase 3 branch remain outstanding. Proposed tactical coefficients and the 1.5-point cap are not final owner-approved values.
- No merge, deployment, production database, live Mini App or bot connection.

## 2026-11-14 — Phase 3B peer-to-peer transfer market implementation
- Added migration `game_server/db/007_player_to_player_transfers.sql`: active listing uniqueness, listing state constraints, transfer history, and a database trigger preventing the existing sell-to-market path from moving a player with an active P2P listing.
- Added `game_server/src/player-transfers.js`: seller listing creation/cancellation, browse, purchase with server ownership checks, squad limits, keeper protection, affordability, listing/player/club row locks, UZS debit-credit ledger entries and a unique transfer history record.
- Integrated authenticated endpoints in `game_server/src/server.js`: public authenticated-market browse, club-owned listings, listing creation, cancellation and purchase.
- Added P2P listing cards and owner actions to `game_client/app.js`: list player at an entered UZS asking price, buy listed players, cancel listings; global listings and the club's own listings load into the transfer-market view.
- Added `game_server/test/player-transfers.test.js` coverage for invalid asking prices, ownership gate, stale/closed listing purchase, bounded browsing, seller-only cancellation and successful mocked accounting flow.
- Added a PostgreSQL end-to-end P2P integration case to `game_server/test/integration/game-loop.test.js` covering list, browse, purchase, duplicate prevention, ownership, seller/buyer squad-lineup repair and ledger consistency.
- CI run `43585008300` completed successfully: `npm test` — 85 passed, 0 failed, 1 skipped; PostgreSQL integration — 37 passed, 0 failed, 0 skipped. The transfer integration test snapshots and restores seeded clubs, budgets, player ownership/resale flag, lineups, ledger rows and transfer records so unrelated tests remain isolated.
- Fixed test-only issues revealed by CI: mock query order/409 conflict expectation, actual club short-name lookup, and fixture cleanup between integration cases.
- Adversarial simultaneous purchase/spend/list/cancel DB concurrency tests remain outstanding. No production DB, live Mini App, bot, merge or deployment.

