# Verification status — isolated management candidate

Updated: 2026-11-12 (rating profiles, Uzbek League 40–90, on top of 4d78e78)
Branch: zamin-fk-management

## Rating profiles — Uzbek League 40–90 (migration 006) — all checks passed

Environment: isolated cloud container, Node v22.23.4, PostgreSQL 16.15 local cluster on localhost:5432, disposable databases `zamin_game` and `zamin_legacy`, dev/mock authentication, headless Chromium via Playwright. Nothing external was contacted.

| Command | Result |
|---|---|
| `npm test` | 55 tests: 54 passed, 0 failed, 1 skipped (integration, no database URL) |
| `node scripts/verify-rating-migration.mjs postgresql://postgres:<pw>@localhost:5432` | 40 checks passed, 0 failed |
| `node scripts/verify-price-migration.mjs postgresql://postgres:<pw>@localhost:5432` | 12 checks passed, 0 failed |
| `INTEGRATION_DATABASE_URL=postgresql://postgres:<pw>@localhost:5432/zamin_game npm run test:integration` | 34 subtests passed, 0 failed (run twice) |
| `node scripts/mobile-smoke.cjs http://127.0.0.1:18181 postgresql://postgres:<pw>@localhost:5432/zamin_game` | 123 checks passed, 0 failed (run once, fresh migrated and seeded database) |

### What was verified
- **Profile:** `uzbek_league` is the only category, in code (`src/ratings.js`) and in the `rating_profiles` table, and the two agree: overall 40–90, potential up to 90, attributes 1–99.
- **Validation:** overall 40 and 90 accepted; 39, 91 and 100 rejected in code and by the database on insert and on update; potential 91 rejected; potential below overall rejected; attribute 99 accepted, 100 and 0 rejected; an unknown category rejected.
- **Generation:** all 360 catalogue players, 50 academy squads and 1,200 youth players comply. The catalogue is unchanged at overall 46–74; exactly the nine potentials that were 91–92 are now 90. No player was added.
- **Upgrades:** through the API, a player at 89 with potential 90 reaches exactly 90 and is priced 31,800,000; every further upgrade is refused with no Development Points spent; an attribute already at 99 cannot be raised.
- **Migration 006 on legacy data** (schema 001–005, 2 clubs, 36 owned players, 10 free agents, lineups, both ledgers): 16 potentials above 90 lowered to exactly 90, 30 others untouched; ownership, overall, attributes, market values, origin, first-sale flags, lineups, budgets, Development Points and both ledgers identical before and after. The runner skips it afterwards, and running the SQL a second time changes no row.
- **Abort:** with one legacy player at overall 39, 91 or 100 the migration stops, rolls back completely and leaves every row as it was.
- **Economy:** price formula, 50% and 80% resale, starting budget and squad value 10,520,000 unchanged; OVR 40 = 160,000, OVR 90 = 31,800,000.
- **Future capacity:** a 95–115 profile defined only inside a test passes the same validation, attribute-template and overall functions; in the database, inside a rolled-back transaction, one extra `rating_profiles` row admitted an overall of 115 with no schema change. No such profile, player or market feature exists in the game.

### Phase A failures now resolved (`test/economy.test.js`)
The three assertions that failed at 4d78e78 were corrected; the price code was not changed.
1. Strictly increasing prices are asserted over the playable range 40–90 (rounding to 10,000 flattens the curve only below 34).
2. Selling the five dearest academy players gives 22,090,000 and leaves 90,000 after two 80-rated signings (the test expected 22,100,000 and 100,000).
3. "Resale never makes money" is strict over 40–90 and non-strict over 1–100 (overall 1–7 price at 0, which no player can have).

### Not tested
- A real device, Telegram, hosted databases, as listed below.
- Migration 004 on a database from before it.
- A match involving a rating above 90: no such player can exist. `squadStrength` still clamps at 100, which must be revisited before any 95–115 category is activated.

## Earlier checkpoint (978bf21) — kept for reference

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
- Club creation (previous checkpoint): 20,000,000 UZS, the exact 18-player distribution, all `academy`, attributes averaging to overall, squad value 38,510,000. The rebalanced expected squad valuation is 10,520,000; updated test has not been run yet.
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
- The seeded market tops out at overall 74, so nothing rated 75–90 can be bought yet and no player is rated 90; pricing and upgrades at 80–90 were tested with players inserted by the tests.
- Waiting clubs never enter a league; they only receive the stipend.
- No running costs: cash accumulates season after season.
- Missions are one-off and do not reset in season 2.
- Lineups are not frozen at kick-off; the lineup saved at settlement is used.
- If the server is down at 20:01, matches, income, stipends and the rollover happen when it next starts.
- The client does not refresh by itself.
- The pitch with moving dots is not shown.
- Formation fit still moves strength by up to ±4, which under the new model is worth about as much as 4 overall.

## Release status
Price rebalance and the 40–90 Uzbek League rating profile are verified on the isolated branch; all suites pass. The 12-formation work has not started. Not production-tested, not deployed, not connected to the existing Mini App or any live database.
