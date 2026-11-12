# ZAMIN FK Management — isolated game server

Independent Node.js API and PostgreSQL schema for the management-game candidate. This directory is not mounted into the existing Mini App, bot, city server or stadium.

## Runtime
- Node.js 22+
- PostgreSQL (a separate Neon project is suitable)
- Install dependencies, configure environment, run migrations, seed the market, then start the server.
- No production credentials are included.

## First setup
1. Create a new, separate database/project. Do not use the existing Mini App database.
2. Create the separate PostgreSQL database named zamin_game, then copy .env.example to .env and set DATABASE_URL to that database.
3. Keep EXPECTED_DATABASE_NAME=zamin_game. The server readiness check, migration runner and seed script refuse to proceed if the connected database name differs.
4. Set TELEGRAM_BOT_TOKEN only when ready to enable Telegram Mini App authentication.
5. Run npm install, npm run db:migrate, npm run db:seed, npm test, then npm start.
6. Set WEB_ORIGIN to the exact game origin before production use.

## Local verification
- `npm test` — unit tests; no database required.
- `npm run test:integration` — full game loop. Requires `INTEGRATION_DATABASE_URL` pointing at a throwaway PostgreSQL database named zamin_game on localhost. The test resets that database and refuses any non-local host. Never point it at Neon or a shared database.
- `node scripts/mobile-smoke.cjs http://127.0.0.1:<port> postgresql://postgres@localhost:<port>/zamin_game` — emulated mobile browser check against a local development server (`NODE_ENV=development`, `ALLOW_DEV_AUTH=true`) on a freshly migrated and seeded local database. Requires Playwright, which is not a project dependency.

Users cannot start matches, so both the integration test and the smoke script move kick-off times into the past directly in the local database and then wait for the server's own scheduler. There is no API or setting that accelerates a match.

## Economy
Values are fixed in `src/economy.js`, not in the environment. See BALANCING_DEFAULTS.md for the full table.
- Each user manages one club. A new club gets 20,000,000 UZS and an identical generated academy squad of 18 (`src/catalog.js`).
- Players have an `origin`: `market` (seeded catalogue), `academy` (starter squads) or `generated` (youth supply). All are fictional.
- Price is 11,000,000 × 1.112^(overall − 80), rounded to 10,000 UZS. An 80 OVR player costs 11M; a 60 OVR player costs about 1.32M. Academy players sell for 50% the first time, everything else for 80%. Squads hold 13 to 26 players. Migration `005_price_rebalance.sql` reprices existing database rows.
- League clubs earn 750,000 UZS per completed league match. Clubs outside the league receive the same amount per completed league matchday (`stipend_runs` and `stipend_payments` make each payment once-only).
- When a season completes, the scheduler creates the next one for the same ten clubs, starting two rest days after day 19. A unique index on the season number makes this once-only.
- The match model and its verification are in `src/simulation.js` and `test/simulation.test.js`.

## League schedule and scheduler
- The league is created when the 10th club exists: 18 rounds, 90 fixtures, every opponent home and away.
- One round per day at 20:00 Asia/Tashkent (computed in PostgreSQL with that IANA zone, never from the server's local timezone). Matchdays 1–9, a rest day on day 10, matchdays 11–19.
- A match lasts 60 seconds. `src/matches.js` runs a scheduler inside the server process: it sleeps until the next fixture's kick-off + 60 s, then settles every due fixture in kick-off order, one transaction each, and updates standings, Development Points and missions. It starts with the server, needs no user to be online and settles anything missed during downtime at start-up.
- Settlement uses `FOR UPDATE SKIP LOCKED`, so several server instances can run without settling a fixture twice.
- `SCHEDULER_MAX_IDLE_MS` (default 15000) only sets how often an idle scheduler looks for newly created fixtures. It does not change kick-off or settlement times.
- Friendlies are created only from an accepted challenge, are settled by the same scheduler, and never change standings, league progression, Development Points or missions. A match occupies [kick-off, kick-off + 60 s); a friendly cannot overlap a league match or another friendly of either club. When a league is created, an already accepted friendly in a league slot is cancelled.
- On opening, the client shows the club's latest completed match first (newest unviewed result, otherwise the latest result), with the report and earlier results, then continues to the dashboard. Result history and the viewed state live in the database (`fixture_result_views`); opening the game only reads.

## Authentication
Production requests use Telegram Mini App initData sent as JSON to POST /api/auth/telegram. The server validates Telegram's HMAC signature and freshness, then issues a short-lived signed bearer token. Never put the bot token or session secret in browser code. For isolated local testing only, ALLOW_DEV_AUTH=true permits x-dev-user-id; this is rejected outside NODE_ENV=development.

## API
- GET /health (liveness)
- GET /ready (database readiness)
- POST /api/auth/telegram
- GET /api/clubs (clubs owned by the authenticated user)
- POST /api/uploads/crest (PNG/JPG/WEBP, maximum 2 MB)
- GET /api/market
- POST /api/clubs
- GET /api/clubs/:clubId
- POST /api/clubs/:clubId/identity
- GET /api/clubs/:clubId/ledger
- GET /api/clubs/:clubId/development-ledger
- GET /api/clubs/:clubId/squad
- GET /api/clubs/:clubId/lineup
- POST /api/clubs/:clubId/lineup
- POST /api/clubs/:clubId/players/sign
- POST /api/clubs/:clubId/players/sell
- POST /api/clubs/:clubId/players/upgrade
- GET /api/clubs/:clubId/missions
- POST /api/clubs/:clubId/leagues/ensure
- GET /api/clubs/:clubId/league
- GET /api/clubs/:clubId/fixtures
- GET /api/clubs/:clubId/results, GET /api/clubs/:clubId/results/:fixtureId, POST /api/clubs/:clubId/results/viewed
- GET /api/clubs/:clubId/opponents
- GET and POST /api/clubs/:clubId/friendlies, POST /api/clubs/:clubId/friendlies/:requestId/accept|decline|cancel

No route starts or settles a match; see "League schedule and scheduler".

The game client is served by the same origin at /, /app.js, /styles.css and /config.js. Uploaded crest images are stored in the server's persistent uploads directory.

All mutation routes require authentication and ownership checks. Money and match results are calculated server-side. Transfers and match settlement use database transactions and row locks.

## Configuration notes
- The starting budget is 20,000,000 UZS and the starting squad is 18 generated academy players; both are owner-approved.
- Player ratings, attribute costs, transfer values, match probabilities and mission rewards are initial balancing defaults and should be tuned after playtesting.
- The league is created only after at least 10 clubs exist. League size and season format are provisionally set to a 10-club round-robin.
- This is a deployment candidate, not production-approved. Security review, backups, rate limiting, monitoring, load testing and cloud configuration remain required before launch.

## Project documents
- API_REFERENCE.md — endpoint payloads and authentication.
- CLOUD_ARCHITECTURE.md — server/database separation and scaling limits.
- BALANCING_DEFAULTS.md — provisional gameplay and economy values.
- OPEN_DECISIONS.md — owner decisions required before public launch.
- VERIFICATION_STATUS.md — checks actually completed versus checks still pending.
- deploy/ORACLE_CLOUD_SETUP.md — VM and Docker deployment.
- deploy/MOBILE_ACTIVATION_GUIDE.md — Android-first setup.
- deploy/ENVIRONMENT_CHECKLIST.md — private environment and activation checklist.
