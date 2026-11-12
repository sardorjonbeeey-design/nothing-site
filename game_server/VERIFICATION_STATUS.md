# Verification status — isolated management candidate

Updated: 2026-11-12 (price curve rebalanced after checkpoint 978bf21; rerun pending)
Branch: zamin-fk-management

Everything below was run in an isolated development container against a throwaway local PostgreSQL 16 cluster (database `zamin_game` on localhost) with dev/mock authentication. No Neon, live database, Telegram service, Mini App or deployment was involved. No real device and no production system was used.

Time was never accelerated through the application. Tests moved `kickoff_at` into the past directly in the local database and waited for the server's own scheduler.

## Executed and passed
### Unit tests — `npm test` — 44 passed, 0 failed (integration test skipped without a database)
- **Economy (previous checkpoint):** tests passed for constants, resale, ledger rules and upgrade formula. The price curve was changed afterward and its test assertions have been updated to the new table: OVR 60 = 1,320,000; 70 = 3,800,000; 80 = 11,000,000; 85 = 18,700,000; 90 = 31,800,000. The rebalanced tests have not yet been executed.
- **Catalogue:** approved offsets sum to zero; templates average exactly to overall for every position and rating 1–99; 360 market players consistent; the academy squad matches the approved distribution in 20 generated squads; youth players are 45–50.
- **Lineup repair:** same position, same line, goalkeeper rules, cleaning of invalid entries, and 20,000 random squads and lineups that all end with a valid XI.
- **Match model (40,000 seeded matches per pairing):** win rate and points at gaps 0, 3, 6, 10, 15, 20, 26 within 2 points / 0.05 of the approved table; same gap worth the same at ratings 46 to 80; home win about 40% between equal sides; about 2.95 goals per match; all five formations fair when their own shape is fielded; a wrong shape costs strength, bounded at 8 points in the worst case.
- Auth, HTTP validators, uploads, schedule generators as before.

### Integration tests — `npm run test:integration` — 32 subtests passed, 0 failed (run four times)
Server processes run with `TZ=America/New_York`. Newly covered:
- Previous checkpoint: migration 004 on a clean database; seeding twice gives 360 market and 12 generated players. Migration 005 and its new SQL formula checks have been added, but not executed yet.
- Club creation: 20,000,000 UZS, the exact 18-player distribution, all `academy`, attributes averaging to overall, squad value 38,510,000, XI of the eleven strongest.
- One club per user: second request 409; three simultaneous requests create one club; a direct database insert is refused by the unique index.
- Market: prices follow the curve; an 80-rated player is refused at the opening budget; `maxValue` filter; youth stock covers all 12 slots; buying one creates exactly one replacement; selling it back creates none.
- Resale: academy first sale 50%, bought back at full price and resold at 80%; youth and catalogue players 80%.
- Lineup: selling a starting striker promotes a striker; selling the starting goalkeeper promotes the other; the last goalkeeper cannot be sold; the XI is valid after every sale.
- Squad limits: selling refused at 13; signing refused at 26, including youth players, with no money moved.
- Income: 750,000 per league club per match, once per fixture, also with two schedulers racing; 13,500,000 over the season; an untouched league club ends on 33,500,000.
- Stipend: waiting clubs receive 750,000 per completed matchday, once; league clubs never; a club registered after matchday 2 is paid for 16 matchdays, not 18; no route exists to claim it.
- Every club's budget equals the sum of its ledger at each checkpoint.
- Rollover: season 2 created once, 21 days after season 1's start, same ten clubs, zeroed table, 90 fixtures at 20:00 Tashkent; two schedulers, a restart and the ensure route create nothing more; a duplicate season is refused by the database; squads, attributes, lineups, cash, Development Points and result history unchanged; waiting clubs still waiting.
- Season 2 matchday 1 pays and counts on its own; the season 1 table stays final; every club still has a valid XI.
- Six attribute points raise overall by exactly one and reprice the player.
- Earlier coverage (auth, schedule, 60-second settlement, catch-up, friendlies, results and viewed state) still passes.

### Mobile browser smoke test — `node scripts/mobile-smoke.cjs <local-url> <local-db-url>` — 123 checks passed, 0 failed (run twice)
Headless Chromium, Pixel 7 emulation and a 360 px viewport. Newly covered: 20,000,000 UZS budget shown, no second-club control, squad limits and academy resale label, youth intake list, affordable filter, signing a youth player at its listed price, selling a starter with automatic promotion, league income in the finance history, season label, waiting-club message. No layout overflow, no console errors.

## Not executed
- Any real device, the real Telegram in-app browser, real Telegram login.
- A real-time 20:00 kick-off, a real 19-day season or a real two-day break; season timing was verified from stored dates.
- More than two seasons, and long-run money supply over many seasons (calculated only, see the economy proposal).
- Migration 004 on a database that already holds data from before it (legacy rows are repriced; their attributes are not re-templated; the migration stops if a user owns more than one club).
- More than one league, or more than 13 clubs.
- Docker, Caddy, HTTPS, Neon or any hosted database, load, rate-limit and security testing.
- Crest upload through the browser file picker.

## Remaining limitations
- All players are fictional. The real-player database is not implemented (data rights and source access are unresolved).
- The seeded market tops out at overall 74, so nothing rated 75+ can be bought yet; elite pricing was tested with a player inserted by the test.
- Waiting clubs never enter a league; they only receive the stipend.
- No running costs: cash accumulates season after season.
- Missions are one-off and do not reset in season 2.
- Lineups are not frozen at kick-off; the lineup saved at settlement is used.
- If the server is down at 20:01, matches, income, stipends and the rollover happen when it next starts.
- The client does not refresh by itself.
- The pitch with moving dots is not shown.
- Formation fit still moves strength by up to ±4, which under the new model is worth about as much as 4 overall.

## Release status
Price-curve rebalancing checkpoint committed to the isolated development branch; updated tests are pending execution. Not production-tested, not deployed, not connected to the existing Mini App or any live database.
