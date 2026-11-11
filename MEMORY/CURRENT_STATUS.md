# Current Status

Last updated: 2026-11-11
Repository: sardorjonbeeey-design/nothing-site
Branch: zamin-fk-management
Phase: isolated server + client with scheduled league, locally verified
Production connection: NONE
Integration approval: NOT GRANTED

## What exists
- prototype/ — original browser-only club-setup demo (localStorage). Superseded by game_client/. IMPLEMENTED / UNVERIFIED.
- game_server/ — Node.js API and PostgreSQL schema: auth, clubs, squad, lineup, transfers, upgrades, missions, league, fixtures, match simulation.
- game_client/ — mobile-first single-page client served by the game server.
- game_server/deploy/ — Docker, Caddy and cloud guides. NOT EXECUTED.

## Verification (2026-11-11, local only)
VERIFIED locally against a throwaway local PostgreSQL, with mock/dev authentication:
- Unit tests: 22 passed.
- Integration tests: 29 subtests passed.
- Emulated mobile browser smoke test (Pixel 7 and 360 px): 111 checks passed.
Details, untested areas and known issues: game_server/VERIFICATION_STATUS.md.

NOT verified: a real-time 20:00 kick-off and 19-day season, real phone, real Telegram, Docker/Caddy, hosted database, load and security.

## League and matches (IMPLEMENTED, owner-approved rules)
- 10-club double round-robin: 18 rounds on matchdays 1–9 and 11–19, rest day on day 10, 19 calendar days.
- All five fixtures of a matchday kick off at 20:00 Asia/Tashkent, last 60 seconds and are settled by the server's own scheduler at 20:01. Users cannot start, delay, accelerate, replay or settle matches.
- Friendlies: challenge with a proposed time, accept or decline; one-minute slots; never affect the league.
- Opening the game shows the latest completed match first; result history and viewed state are stored server-side.

## Next steps (PROPOSED, awaiting owner)
1. Confirm the provisional choices in game_server/OPEN_DECISIONS.md (season start day, friendly rewards, same-owner friendlies, lineup freeze, pitch view).
2. Decide what happens after a season ends and how later clubs join.
3. Balance decisions: opening budget, starter-squad fairness, UZS income, one club per user.

## Boundaries
Do not connect the live Telegram Mini App, live bot, existing backend, production or Neon database, supporter economy or existing community systems. No merge, deployment or integration without explicit owner approval.
