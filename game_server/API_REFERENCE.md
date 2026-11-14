# ZAMIN FK Management API reference

Base URL: the isolated game-server origin. The mobile client is served from the same origin.

## Authentication

### POST /api/auth/telegram
Request:
```json
{"initData":"<raw Telegram.WebApp.initData>"}
```
Response: signed bearer token and the authenticated game-user profile. Never send initDataUnsafe or expose the bot token in the browser.

All other /api routes require:
```
Authorization: Bearer <token>
```

Local-only development authentication is available only when NODE_ENV=development and ALLOW_DEV_AUTH=true, using the x-dev-user-id header. Never enable this on a public server.

## Club and identity

### GET /api/clubs
Returns the authenticated user's clubs.

### POST /api/clubs
```json
{
  "name":"Tashkent United",
  "shortName":"TUN",
  "primaryColour":"#167A55",
  "secondaryColour":"#F0C75E",
  "crestUrl":"/uploads/<uploaded-file>"
}
```
The crestUrl field is optional. A starter squad and default 4-3-3 lineup are assigned automatically.

### GET /api/clubs/:clubId
Returns club identity, UZS budget and Development Points.

### POST /api/clubs/:clubId/identity
Accepts the same identity fields as club creation. Omit crestUrl to keep the current crest.

### POST /api/uploads/crest
```json
{"dataUrl":"data:image/png;base64,<image-data>"}
```
Accepts PNG, JPEG or WEBP up to 2 MB. Returns a server-local persistent upload path.

## Squad, lineup and transfers

- GET /api/clubs/:clubId/squad — virtual players, attributes, potential and values. Every player has `category` `uzbek_league`: overall 40–90, potential at most 90, attributes at most 99. An upgrade never raises an attribute above the player's potential, so overall cannot pass 90.
- GET /api/clubs/:clubId/lineup — current formation, starters and substitutes.
- POST /api/clubs/:clubId/lineup — requires one of the 12 formations, 11 unique owned starters with exactly one goalkeeper who can fill every slot of that formation in a natural or cover role, and up to 7 unique owned substitutes who are not starters. Anything else is refused with 400 and nothing is stored. Two allowances keep existing clubs from being locked out: the lineup the club already has is always accepted again unchanged, and an XI may hold as many players out of position as the squad's best possible XI in that formation needs, or as the saved XI already holds in the same formation (it can be improved, never made worse). Formation, 11 unique owned starters and a goalkeeper are always required. Only `formation`, `starters` and `substitutes` are read; the response carries the server's own `analysis` (fit, formation fit bonus, strength, slot of each player).
- GET /api/clubs/:clubId/formations — the 12 formations (slots with natural and cover positions, note), the analysis of the saved lineup (`current`), and for each formation the best XI this squad can field (`best`: starters, substitutes, fit, strength, valid).

Formations: 4-3-3, 4-2-3-1, 4-4-2, 4-1-4-1, 4-4-1-1, 3-5-2, 3-4-3, 3-4-2-1, 5-3-2, 5-4-1, 4-2-2-2, 4-3-2-1. Definitions live in `src/formations.js`.

Lineup request:
```json
{"formation":"4-3-3","starters":["<player-uuid>"],"substitutes":[]}
```
The starters array must contain exactly 11 player UUIDs.

- GET /api/market — free-agent market.
- POST /api/clubs/:clubId/players/sign — body: { "playerId": "<uuid>" }.
- POST /api/clubs/:clubId/players/sell — body: { "playerId": "<uuid>" }.
- POST /api/clubs/:clubId/players/upgrade — body: { "playerId": "<uuid>", "attribute": "pace", "levels": 1 }.

### Club-to-club transfer market (migration 007)
- GET /api/transfers?limit=50&offset=0 — authenticated public listings from other clubs, with player data, asking price, seller identity and market value. Page size is bounded to 100.
- GET /api/clubs/:clubId/transfers — listing history for the authenticated user's own club.
- POST /api/clubs/:clubId/transfers — create a listing. Body: { "playerId": "<uuid>", "askingPriceUzs": "1250000" }. Asking price must be a positive whole-number UZS string.
- POST /api/clubs/:clubId/transfers/:listingId/buy — buy the active listing at its displayed asking price; empty JSON body.
- POST /api/clubs/:clubId/transfers/:listingId/cancel — cancel the seller's active listing; empty JSON body.

The server validates seller/buyer ownership, different managers, listing and player state, buyer affordability, squad maximum/minimum and goalkeeper retention. Purchase atomically updates both budgets, player ownership, paired UZS ledger entries, transfer history and both lineups. A partial unique index prevents duplicate active listings; purchase and cancel lock the listing first. An active P2P listing blocks the separate sell-to-free-agent route until cancelled. All prices and accounting are server-side; the client cannot submit match results.

## Missions, matches and league

- GET /api/clubs/:clubId/missions — objective progress and rewards.
- GET /api/clubs/:clubId/ledger — last 30 UZS transactions.
- GET /api/clubs/:clubId/development-ledger — last 30 DP transactions.
- POST /api/clubs/:clubId/leagues/ensure — checks the 10-club threshold and creates the league if needed. It cannot start or settle matches.
- GET /api/clubs/:clubId/league — standings.
- GET /api/clubs/:clubId/fixtures — the club's league and friendly fixtures in kick-off order, each with `kind`, `day_number`, `kickoff_at`, `status` and `phase` (`upcoming`, `live`, `played`, `cancelled`).

There is no route that starts, delays, accelerates, replays or settles a match. `POST /api/fixtures/:fixtureId/play` has been removed. Matches are settled only by the server's scheduler (see README, "League schedule and scheduler").

## Economy rules enforced by the server
- POST /api/clubs — one club per user (409 otherwise). The club receives 20,000,000 UZS and a generated 18-player academy squad.
- GET /api/market?maxValue=N — up to 100 free agents by overall (optionally at most N UZS), plus `youth` (the generated 45–50 players) and `squadLimits`.
- POST /api/clubs/:clubId/players/sign — refused at 26 players or with insufficient budget. Price is the player's market value.
- POST /api/clubs/:clubId/players/sell — refused at 13 players or for the last goalkeeper. Pays 50% for an academy player's first sale and 80% otherwise; the response has `feeUzs`, `resaleRatePercent` and `promoted` (players moved into the XI automatically).
- GET /api/clubs/:clubId/league — `leagueExists`, `season`, `table`, and `previous` (the season before, with its final table).
- League income (750,000 UZS per completed league match) and the waiting-list stipend are paid only by the scheduler. There is no route to claim either.

## Results
- GET /api/clubs/:clubId/results?limit=20 — completed matches of the club, newest first, each with `outcome` (`win`, `draw`, `loss`) and `viewed`; also `unviewedCount`. Reading does not change the viewed state.
- GET /api/clubs/:clubId/results/:fixtureId — one completed match including its `events` (the match report).
- POST /api/clubs/:clubId/results/viewed — body `{fixtureIds:[...]}` or `{all:true}`. Stores the viewed state on the server, per club.

## Friendlies
- GET /api/clubs/:clubId/opponents — clubs of other users that can be challenged.
- GET /api/clubs/:clubId/friendlies — sent and received requests.
- POST /api/clubs/:clubId/friendlies — body `{opponentClubId,kickoffAt}` (ISO date-time, truncated to the minute). Creates a pending request only.
- POST /api/clubs/:clubId/friendlies/:requestId/accept — receiving club only; creates the friendly fixture (requesting club at home).
- POST /api/clubs/:clubId/friendlies/:requestId/decline — receiving club only.
- POST /api/clubs/:clubId/friendlies/:requestId/cancel — requesting club only, while pending.

A request or acceptance is refused with 409 when either club already has a match whose one-minute slot overlaps the proposed one.

## Public operational routes
- GET /health — process liveness.
- GET /ready — verifies that PostgreSQL is reachable and its current database name matches EXPECTED_DATABASE_NAME.
