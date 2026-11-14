# Owner-approved next phase — competition, transfers and administration

Status: Phase 3A formation matchup model, Phase 3B player-to-player transfer market, Phase 3C sole-owner super-admin, inactivity forfeits, match bonuses, and season prizes are implemented on `zamin-management-isolated`; final verification and longer formation balance review remain.
Scope: isolated ZAMIN FK Management game only. Do not connect to the live Mini App, production backend, bot, or live database.

## 1. Competition integrity and match outcomes

- Do not impose an artificial cap on wins or force a loss to prevent an 18-win season.
- A club with a materially stronger squad (for example, 90 OVR versus 70 OVR) may legitimately win every match.
- Match outcomes must continue to come from the match engine using squad strength, formation/tactical fit, home advantage and calibrated match variance. No scripted champion or hidden result manipulation.
- Keep the existing 10-club double round-robin: 18 matches per club, 90 fixtures total.

## 2. Club-owner inactivity

- The 48-hour inactivity rule applies to each club's owner/manager, not the sole super-admin.
- Qualifying activity is an authenticated, user-initiated state-changing game request. Passive GET requests, dashboard refreshes, and background polling do not count.
- Activity events are stored with timestamps. Eligibility is evaluated against the scheduled kick-off timestamp (not the later settlement time), and activity after kick-off cannot erase a forfeiture already earned.
- If an owner has had no qualifying activity for 48 consecutive hours at scheduled kick-off, that club forfeits that fixture automatically.
- Show an in-app warning at 24 hours idle and a final warning at 46 hours idle (2 hours remaining).
- One inactive owner: the active opponent wins 3–0 and receives the normal win bonus.
- Both owners inactive: 0–0 double forfeit; both clubs record a loss, neither receives league points or a match-result bonus.
- Apply the forfeit server-side and idempotently; record the forfeit reason in fixture events/result history.
- Assess each fixture independently. Remaining inactive does not create extra losses between scheduled fixtures.
- Implemented in `src/competition.js`, `src/matches.js`, `/api/clubs/:id/activity`, and the club dashboard warning panel; migration `009_competition_rewards.sql` stores activity history.

## 3. Formation choices

Provide 12 selectable formations:
1. 4-3-3
2. 4-2-3-1
3. 4-4-2
4. 4-1-4-1
5. 4-4-1-1
6. 3-5-2
7. 3-4-3
8. 3-4-2-1
9. 5-3-2
10. 5-4-1
11. 4-2-2-2
12. 4-3-2-1

Formations must alter the actual match simulation, not only the pitch display. Effects should be based on player position suitability and tactical trade-offs (defence, midfield control, width, attacking presence and transitions). Do not grant a large unconditional formation bonus. Rebalance and test all 12 formations across equal and unequal squads before release.

### Phase 3A implementation note (2026-11-14)
- A first model is implemented in `src/formation-tactics.js` and connected to `src/simulation.js` on `zamin-management-isolated`.
- It uses role-weighted attribute surplus/deficit relative to OVR and applies an antisymmetric matchup adjustment capped at a proposed 1.5 total rating-point swing.
- CI run `43515953300` passed: 79 unit tests passed, 0 failed, 1 skipped; PostgreSQL integration 36/36 passed. The all-12-formation matchup and balance tests passed.
- The numeric weights and cap remain PROPOSED, not final owner-approved balance values. A longer full-season simulation with realistic squads remains required.

## 4. Player-to-player transfer market

- Club owners can list players owned by their club for sale.
- Seller chooses an asking price in UZS.
- Other clubs can view the listing and buy at the displayed price.
- Enforce squad minimum (13) and maximum (26), affordability, ownership and listing state on the server.
- Transfer must atomically debit buyer, credit seller, change player ownership and create ledger/history records.
- Prevent duplicate purchases, stale listings, concurrent double-spends and selling a player while a transfer is pending.
- Keep existing buy-from-market and sell-to-market rules separate from peer-to-peer transfers unless explicitly redesigned.

## 5. Sole super-admin panel

- There is one super-admin: the project owner. No public admin registration or multi-admin management is required now.
- Admin panel must be separate from normal club-owner UI.
- Authorization and every privileged operation must be enforced server-side; hiding an admin page is not security.
- Initial capabilities requested: inspect/manage clubs and players; adjust club money; gift players; grant/revoke Gold and VIP badge; manage competition settings and rewards.
- Every admin mutation must be audited with actor, timestamp, target club/player, action, before/after values and reason.
- Build the data model so more admin roles could be added later, but do not build multi-admin workflows now.

### Phase 3C implementation note (2026-11-14) — COMPLETE, CI VERIFIED
- Separate dashboard at /admin; owner-only Telegram ID gate is enforced server-side using SUPER_ADMIN_TELEGRAM_ID (numeric in production).
- Implemented club/user/player inspection, ledgered funds adjustments, player gifts with transactional squad validation and lineup repair, Gold/VIP grant/revoke, account entitlement read, persistent JSON competition settings/rewards and audit log.
- Migration 008 adds admin audit, entitlements and settings. Audit entries are required-reason, actor/target/action/time/before-after recorded and DB-enforced append-only.
- CI run 43587396857: 88 unit/default passed, 0 failed, 1 skipped; PostgreSQL integration 38/38 passed. Follow-up CI run 43587550239 passed, including production Telegram ID format validation: 88 unit/default passed, 0 failed, 1 skipped; PostgreSQL integration 38/38 passed.


## 6. Match and season rewards

### Match rewards — owner-approved
- Win: 250,000 UZS to the winning club.
- Draw: 100,000 UZS to each club.
- Loss: no match-result bonus.
- Rewards are paid by the server after official settlement, exactly once per fixture, and written to the money ledger.
- These are additional to the existing 750,000 UZS league-match income unless the owner later changes that rule.

### Season top-three rewards — owner-approved and implemented
- 1st: 10,000,000 UZS.
- 2nd: 7,000,000 UZS.
- 3rd: 5,000,000 UZS.
- Standings order: points, goal difference, goals scored, head-to-head points, then head-to-head goal difference.
- Head-to-head figures are calculated among clubs tied on the first three criteria.
- If clubs remain tied after all criteria, they share the tied positions and split the combined prize money for those positions equally. Any indivisible UZS remainder is distributed one so'm at a time in deterministic standings order.
- A tie extending beyond 3rd place shares only the prize pool for the top-three positions occupied by that tie.
- Pay once after the season is complete. `season_prize_payments` is unique by league and club; each payment is ledgered as `season_prize`.

## 7. Remaining delivery order

1. Re-run the pending price-rebalance migrations and complete test suite on the current isolated branch; review proposed formation coefficients and perform longer realistic full-season balance simulations.
2. Add and pass adversarial tests for concurrent transfers, duplicate rewards, scheduler restarts, single/double inactivity forfeits, tie-split payouts, and economy balance.
3. Run longer realistic full-season formation balance simulations and review the proposed tactical coefficients before any release.

Completed Phase 3 systems: formation tactical matchup model (3A), player-to-player market (3B), sole-owner super-admin (3C), inactivity forfeits, match bonuses, standings tie-breaks and season prizes.

## Safety boundary

All work stays on the isolated `zamin-management-isolated` branch. The source Phase 2 and original management branches remain untouched. No merge, deployment, production credentials, live database, bot connection or live Mini App changes without separate explicit approval.
