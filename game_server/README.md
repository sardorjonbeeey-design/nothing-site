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
- POST /api/fixtures/:fixtureId/play

The game client is served by the same origin at /, /app.js, /styles.css and /config.js. Uploaded crest images are stored in the server's persistent uploads directory.

All mutation routes require authentication and ownership checks. Money and match results are calculated server-side. Transfers and match settlement use database transactions and row locks.

## Configuration notes
- Starting budget defaults to 0 UZS because the owner has not approved an opening amount.
- Starting squad size defaults to 18 as a provisional implementation setting, not a frozen game-design decision.
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
