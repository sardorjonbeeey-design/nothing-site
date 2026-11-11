# Development History

Chronological record. Append entries; do not erase earlier history.

## 2026-11-11 — Independent memory
- Owner set a strict boundary: do not change existing code or systems; create new work only in new files or an isolated branch; do not connect it yet.
- Work continues on zamin-management-isolated.
- Owner clarified that “base” meant project memory, not technical architecture.
- Owner approved keeping written project memory independent from Telegram Mini App.
- Created this independent memory set under ZAMIN_FK_MANAGEMENT/MEMORY/.
- Existing Mini App, bot, city, stadium, supporter portal, existing economy and production database remain out of scope and disconnected.

## Earlier agreed game baseline — captured 2026-11-11
- Football club management game.
- Club identity includes name, short name, colours and optional crest upload.
- No built-in logo editor; external prompt and upload flow.
- Players have quality levels and attributes and can be upgraded.
- UZS is money; development points are separate.
- Matches and missions award development points; manager allocates a shared club balance.
- Matches use moving dots on a pitch in accelerated view.
- Match results are probabilistic and influenced mostly by squad strength.
- League activates when at least 10 clubs exist.
- Starting budget and detailed balance remain undecided.

## 2026-11-11 — Isolated game server and client (recorded retrospectively)
- An isolated Node.js game server (game_server/) and mobile client (game_client/) were added after the club-setup prototype. This was not recorded in memory at the time.

## 2026-11-11 — Move to dedicated repository
- Project moved to repository sardorjonbeeey-design/nothing-site, branch zamin-fk-management. Owner instructed that all work stays on this branch. Earlier references to branch zamin-management-isolated and the ZAMIN_FK_MANAGEMENT/ folder are historical.

## 2026-11-11 — Local verification phase
- Owner approved a verification-only phase: no production, no Neon/live database, no Telegram Mini App integration, no deployment, no new gameplay features, no design or balance changes.
- Fixed three defects: client static files returned 500; x-frame-options conflicted with the Telegram frame-ancestors policy; seed script failed on PostgreSQL.
- Added integration tests (throwaway local PostgreSQL, mock/dev authentication) and an emulated mobile browser smoke test.
- Results: unit 19 passed; integration 22 passed; mobile smoke 54 checks passed. Untested areas and known issues recorded in game_server/VERIFICATION_STATUS.md.
- Known design/balance issues were observed and deliberately left unchanged pending owner decisions.

## 2026-11-11 — League scheduling, friendlies and opening result screen
- Owner finalised the league rules: one league match per club per day at 20:00 Asia/Tashkent, 18 matchdays over 19 days with a rest day on day 10, 60-second matches settled by the server at 20:01, no user control over league matches; friendlies through an accepted challenge; the latest result shown first when the game opens.
- Implemented: migration 003, double round-robin schedule, in-process scheduler (src/matches.js), removal of the manual play route, results and viewed-state endpoints, friendly request endpoints, client fixtures/results/friendlies pages and the opening result screen.
- The single round-robin with a Play button (45 fixtures) is replaced.
- Results: unit 22 passed; integration 29 subtests passed; mobile smoke 111 checks passed. See game_server/VERIFICATION_STATUS.md.
- Provisional choices made during implementation are listed in game_server/OPEN_DECISIONS.md for owner confirmation.
