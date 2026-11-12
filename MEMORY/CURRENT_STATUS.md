# Current Status

Last updated: 2026-11-12
Repository: sardorjonbeeey-design/nothing-site
Branch: zamin-fk-management
Phase: isolated server + client with scheduled league, seasons and economy; price curve rebalanced on branch, tests pending rerun
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
