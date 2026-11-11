# Verification status — isolated management candidate

Updated: 2026-11-11 (league scheduling, friendlies and opening result screen)
Branch: zamin-fk-management

Everything below was run in an isolated development container against a throwaway local PostgreSQL 16 cluster (database `zamin_game` on localhost). No Neon, live database, Telegram service, Mini App or deployment was involved.

Time was never accelerated through the application. Tests moved `kickoff_at` into the past directly in the local database and then waited for the server's own scheduler.

## Executed and passed
### Unit tests — `npm test` — 22 passed, 0 failed (integration test skipped without a database)
Auth signature checks, economy helpers, HTTP validators, match simulation, crest upload validation, single and double round-robin generators (18 rounds, 90 fixtures, every pairing home and away, one match per club per round), matchday mapping 1–9 and 11–19, timing constants.

### Integration tests — `npm run test:integration` — 29 subtests passed, 0 failed (run three times)
Run with `INTEGRATION_DATABASE_URL=postgresql://postgres@localhost:<port>/zamin_game`. The server processes run with `TZ=America/New_York` to prove kick-offs do not depend on the server's timezone. Covered, in addition to the earlier auth, club, lineup, transfer and upgrade checks:
- Migration 003 applies on a clean database and is skipped on a repeat run.
- League creation with the 10th club: 90 fixtures, 18 per club (9 home), days 1–9 and 11–19, five fixtures per day sharing one kick-off, every kick-off exactly 20:00:00 Asia/Tashkent (15:00 UTC), first to last kick-off 18 days apart, day 1 is the next Tashkent calendar day.
- No user route can start, settle, replay or reschedule a fixture (all return 404); reading every screen settles nothing.
- A matchday that kicked off 57 seconds ago is reported as `live`, is not settled before 60 seconds, and all five fixtures are settled between 60 and 63 seconds after kick-off with no request in between; standings and rewards update for all ten clubs.
- Two server instances on one database settle each fixture exactly once.
- Matchdays missed while no server was running are settled in kick-off order at start-up.
- Full season: 90 fixtures settled automatically in order, every club played 18, points = 3W + D, wins = losses, goals for = goals against, league marked completed, no second league created.
- Development Points: 2 per league match plus mission rewards, ledger sums to the balance.
- Friendlies: validation (own club, unknown club, past, too soon, too far, not owner), duplicate refused, a request alone creates no fixture, only the receiver can accept or decline, only the sender can cancel, the same minute is refused for either club while the minute before and after are free, of two pending requests for one slot only the first acceptance succeeds.
- League creation cancels an accepted friendly in a league slot; afterwards requests and acceptances in [20:00, 20:01) are refused and 20:01 is free.
- A friendly is settled by the scheduler and leaves standings, Development Points and missions unchanged; a pending request past its time expires.
- Results: newest first, correct win/draw/loss, report with events, another user and unrelated fixtures get 404, reading does not mark as viewed, viewed state is stored per club, idempotent, `all:true` clears the count, a newly settled match arrives unviewed and first.
- No server-side error logged by any server instance.

### Mobile browser smoke test — `node scripts/mobile-smoke.cjs <local-url> <local-db-url>` — 111 checks passed, 0 failed (run three times)
Headless Chromium with Pixel 7 emulation and a 360 px wide viewport, dev authentication injected, Telegram script blocked. Covered: club creation, overview, squad and lineup, market, missions, empty states, 18 fixtures with 20:00 Tashkent kick-offs and no play control, a live match shown without a score, friendly challenge form with sent, incoming, accepted and declined requests, the opening result screen (new and already-seen, both clubs and crests, score, win/draw/loss, date and time, report, previous and newer result, continue to dashboard, viewed state confirmed on the server), results history with report, league table, upgrade, sell, sign, identity edit, no layout overflow and no console errors. A club that has never played opens on the normal dashboard. The 360 px run uses an 11th club, so its result screen was checked with a friendly.

## Not executed
- A real 20:00 Asia/Tashkent kick-off in real time, and a real 19-day season; the schedule was verified from stored timestamps and by moving kick-offs in the local database.
- A real Android/iOS device and the real Telegram in-app browser (only emulated Chromium was used).
- Real Telegram login with a real bot token.
- Crest upload through the browser file picker (tested through the API only).
- Multi-club switcher in the client UI.
- Docker image build, docker-compose, Caddy and HTTPS.
- Neon or any hosted PostgreSQL; a hosted database that suspends when idle may delay the scheduler and has not been tried.
- Rate-limit behaviour, load, abuse and security testing.
- Persistent upload volume on a VM.

## Behaviour to be aware of
- If the server process is not running at 20:01, the matches are settled when it next starts, not at 20:01.
- The lineup used is the one saved when the match is settled (kick-off + 60 s); lineups are not frozen at kick-off.
- The client does not refresh by itself; a result appears on the next opening or after "Refresh".
- The decorative pitch with moving dots was part of the removed Play button and is no longer shown (see OPEN_DECISIONS.md).
- The away team's saved formation is now used in the simulation; before, the away side was always treated as 4-3-3.
- Leagues created by the earlier manual-play prototype are closed by migration 003.

## Known issues observed, deliberately NOT changed (design/balance decisions pending)
- Starter squads take the best remaining free agents, so earlier clubs are stronger; the pool supports about 20 clubs.
- Opening budget is 0 UZS and matches pay no UZS, so signing is only possible after selling.
- Selling a starter leaves fewer than 11 starters; the match engine then uses a low fallback strength.
- Upgrades rarely change `overall`, which is the only input to match strength.
- Only one league season is ever created; clubs after the 10th get no league fixtures; nothing happens after the season completes; one user may own several clubs.

## Release status
Locally verified development candidate. Not production-tested, not deployed, not connected to the existing Mini App or any live database.
