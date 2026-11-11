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

- GET /api/clubs/:clubId/squad — virtual players, attributes, potential and values.
- GET /api/clubs/:clubId/lineup — current formation, starters and substitutes.
- POST /api/clubs/:clubId/lineup — requires 11 unique owned starters including at least one goalkeeper; up to 7 unique owned substitutes.

Lineup request:
```json
{"formation":"4-3-3","starters":["<player-uuid>"],"substitutes":[]}
```
The starters array must contain exactly 11 player UUIDs.

- GET /api/market — free-agent market.
- POST /api/clubs/:clubId/players/sign — body: { "playerId": "<uuid>" }.
- POST /api/clubs/:clubId/players/sell — body: { "playerId": "<uuid>" }.
- POST /api/clubs/:clubId/players/upgrade — body: { "playerId": "<uuid>", "attribute": "pace", "levels": 1 }.

Money, transfers, upgrade costs and DP balances are recalculated server-side. The client cannot submit a price or a match result.

## Missions, matches and league

- GET /api/clubs/:clubId/missions — objective progress and rewards.
- GET /api/clubs/:clubId/ledger — last 30 UZS transactions.
- GET /api/clubs/:clubId/development-ledger — last 30 DP transactions.
- POST /api/clubs/:clubId/leagues/ensure — checks the 10-club threshold and creates the league if needed. It cannot start or settle matches.
- GET /api/clubs/:clubId/league — standings.
- GET /api/clubs/:clubId/fixtures — the club's league and friendly fixtures in kick-off order, each with `kind`, `day_number`, `kickoff_at`, `status` and `phase` (`upcoming`, `live`, `played`, `cancelled`).

There is no route that starts, delays, accelerates, replays or settles a match. `POST /api/fixtures/:fixtureId/play` has been removed. Matches are settled only by the server's scheduler (see README, "League schedule and scheduler").

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
