# Owner-approved next phase — competition, transfers and administration

Status: requirements recorded; implementation not started.
Scope: isolated ZAMIN FK Management game only. Do not connect to the live Mini App, production backend, bot, or live database.

## 1. Competition integrity and match outcomes

- Do not impose an artificial cap on wins or force a loss to prevent an 18-win season.
- A club with a materially stronger squad (for example, 90 OVR versus 70 OVR) may legitimately win every match.
- Match outcomes must continue to come from the match engine using squad strength, formation/tactical fit, home advantage and calibrated match variance. No scripted champion or hidden result manipulation.
- Keep the existing 10-club double round-robin: 18 matches per club, 90 fixtures total.

## 2. Club-owner inactivity

- The 48-hour inactivity rule applies to each club's owner/manager, not the sole super-admin.
- If an owner has had no qualifying active session for 48 consecutive hours at the scheduled kickoff, that club forfeits that fixture automatically.
- Apply the forfeit server-side and idempotently; never rely on the client being open.
- Record a distinct forfeit reason (owner inactivity) in the fixture/result history and financial ledger.
- Do not apply repeated losses merely because an owner remains inactive: assess the rule at each scheduled fixture.
- The qualifying definition of activity, warning/notification timing, and both-sides-inactive handling must be finalized before coding. Background polling alone must not keep an owner active.

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

## 6. Match and season rewards

### Match rewards — owner-approved
- Win: 250,000 UZS to the winning club.
- Draw: 100,000 UZS to each club.
- Loss: no match-result bonus.
- Rewards are paid by the server after official settlement, exactly once per fixture, and written to the money ledger.
- These are additional to the existing 750,000 UZS league-match income unless the owner later changes that rule.

### Season top-three rewards — requested, amounts not yet approved
- Reward 1st, 2nd and 3rd place at the end of the single starting league.
- Exact prize amounts and tie-breaker policy need owner confirmation before implementation.
- Pay once after the final standings are settled; use an idempotent season-reward record.

## 7. Delivery order

1. Re-run the pending price-rebalance migrations and complete test suite on the current isolated branch.
2. Finalize the open inactivity edge cases and top-three prize amounts.
3. Implement and balance all 12 formations.
4. Implement peer-to-peer player listings and purchases.
5. Implement sole-super-admin backend authorization, audit log and admin panel.
6. Implement match bonuses, inactivity forfeits and season top-three payouts.
7. Run adversarial tests for concurrent transfers, duplicate rewards, scheduler restarts, inactive owners, both owners inactive, and economy balance.

## Safety boundary

All work stays on the isolated `zamin-fk-management` branch. No merge, deployment, production credentials, live database, bot connection or live Mini App changes without separate explicit approval.
