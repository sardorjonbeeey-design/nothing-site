# Verification status — isolated management candidate

Updated: 2026-11-11 (local verification phase)
Branch: zamin-fk-management

Everything below was run in an isolated development container against a throwaway local PostgreSQL 16 cluster (database `zamin_game` on localhost). No Neon, live database, Telegram service, Mini App or deployment was involved.

## Defects found and fixed in this phase
1. **Game client could not be served.** `GET /`, `/app.js`, `/styles.css` and `/config.js` returned 500 (`path.join is not a function`) because a local variable shadowed the `path` module in `src/server.js`. Fixed.
2. **Frame-header conflict.** The server sent `x-frame-options: DENY` while the Caddyfile allows Telegram origins via `frame-ancestors`. The server now sends `content-security-policy: frame-ancestors https://web.telegram.org https://*.telegram.org https://t.me`, matching the Caddyfile, and no `x-frame-options`.
3. **Seed script never worked.** `npm run db:seed` failed on PostgreSQL with "inconsistent types deduced for parameter $1". Fixed with explicit casts; the seed is now repeatable (360 players, 5 missions).

## Executed and passed
### Unit tests — `npm test` — 19 passed, 0 failed (integration test skipped without a database)
Auth signature checks, economy helpers, HTTP validators, round-robin generator, match simulation, crest upload validation.

### Integration tests — `npm run test:integration` — 22 passed, 0 failed
Run with `INTEGRATION_DATABASE_URL=postgresql://postgres@localhost:<port>/zamin_game`. The test refuses any non-localhost database and resets the schema. Covered:
- Migrations on a clean database, repeat run skipped; seed repeatable.
- Database-name isolation guard rejects a different database name.
- `/health`, `/ready`, and all static client files served.
- Frame headers as described above.
- API rejects missing and invalid authentication; dev authentication rejected when `NODE_ENV=production`.
- Locally signed mock Telegram initData (fake token, no Telegram contact) issues a working session token; tampered data rejected.
- Crest upload (PNG accepted, SVG rejected), club creation, input validation, 18-player starter squad, 4-3-3 lineup with goalkeeper, opening ledger entry, 5 missions.
- Ownership checks: another user's club returns 404.
- Identity edit keeps the crest when omitted.
- Lineup validation (count, formation, goalkeeper, foreign player) and saving.
- Signing refused at the provisional 0 UZS budget.
- No league below 10 clubs; league, 10 members and 45 fixtures created with the 10th club; an 11th club is not placed in the running league (current behaviour, see known issues).
- Sell then sign: 80% sale value, budget, market return, lineup clean-up, UZS ledger sums to the budget.
- Upgrades refused without Development Points.
- Fixture play: non-participant 403, unknown fixture 404, two concurrent requests settle exactly once, replay returns the stored result, match reward paid once.
- Full 45-fixture season: every club played 9, points = 3W + D, wins = losses, goals for = goals against, table ordered.
- Development Points: 2 per match plus mission rewards, DP ledger sums to the balance, mission completion matches progress.
- Attribute upgrade: correct cost, DP ledger entry, potential cap enforced.
- No server-side 5xx error logged during the run.

### Mobile browser smoke test — `node scripts/mobile-smoke.cjs <local-url>` — 54 checks passed, 0 failed
Headless Chromium with Pixel 7 emulation and a 360 px wide viewport, dev authentication injected, Telegram script blocked. Covered: club creation form, overview, squad and lineup (auto-pick and manual toggle), market, missions, empty fixture/league states, playing three matches with pitch and match report, league table, mission progress, upgrade, sell, sign, finance/DP history, identity edit, no horizontal overflow on any page, no uncaught page or console errors.

## Not executed
- A real Android/iOS device and the real Telegram in-app browser (only emulated Chromium was used).
- Real Telegram login with a real bot token.
- Crest upload through the browser file picker (upload was tested through the API only).
- Multi-club switcher in the client UI.
- Docker image build, docker-compose, Caddy and HTTPS.
- Neon or any hosted PostgreSQL.
- Rate-limit behaviour, load, abuse and security testing.
- Persistent upload volume on a VM.

## Known issues observed, deliberately NOT changed (design/balance decisions pending)
- Starter squads take the best remaining free agents, so earlier clubs are stronger; the pool supports about 20 clubs.
- Opening budget is 0 UZS and matches pay no UZS, so signing is only possible after selling.
- Selling a starter leaves fewer than 11 starters; the match engine then uses a low fallback strength.
- Upgrades rarely change `overall`, which is the only input to match strength.
- Only one league is ever created; clubs after the 10th get no fixtures and see the "at least 10 clubs" message; the season never completes; fixtures can be played in any order; one user may own several clubs.
- The pitch dots are a decorative animation, not driven by match events.

## Release status
Locally verified development candidate. Not production-tested, not deployed, not connected to the existing Mini App or any live database.
