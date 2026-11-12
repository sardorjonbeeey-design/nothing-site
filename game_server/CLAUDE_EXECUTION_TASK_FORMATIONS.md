# Claude Code execution task — verify price rebalance, then implement 12 formations

Repository: `sardorjonbeeey-design/nothing-site`
Branch: `zamin-fk-management`
Working directory: `game_server/`

## Hard safety boundary

- Work only on this isolated branch.
- Do not merge, deploy, connect the live Mini App, touch live backend/database/bot, or use production credentials.
- Use a disposable local PostgreSQL database only.
- Do not overwrite or reset user data.
- Commit in small checkpoints. Do not claim a test passed unless it was actually executed and its output inspected.
- If a test fails, stop feature work, diagnose and fix the failure first.

## Phase A — verify the latest price rebalance before feature work

Latest known branch commit before this task: `03daeaf418824beda36dff09340bcfb0e08abcad`. Confirm the current branch head before starting; do not assume it has not moved.

1. Read `VERIFICATION_STATUS.md`, migrations, economy implementation/tests, package scripts and the current schema.
2. Install dependencies with the lockfile and Node 22+.
3. Create a fresh disposable PostgreSQL 16 database and run the full migration chain from empty state, including migration 005.
4. Verify migration 005 actually reprices existing player rows to the new formula:
   `11,000,000 * 1.112^(overall - 80)`, rounded to the nearest 10,000 UZS.
5. Separately create a legacy-shaped disposable database with pre-existing player rows and verify migration 005 preserves ownership, attributes, budgets, transfer history and ledger entries while updating only market values.
6. Run:
   - `npm test`
   - `npm run test:integration`
   - `node scripts/mobile-smoke.cjs <local-url> <local-db-url>`
7. Verify expected values, including OVR 58 academy first-sale proceeds 530,000 UZS and OVR 74 standard resale proceeds 4,656,000 UZS. Confirm the rebalanced starter squad valuation expected by current tests.
8. Update `VERIFICATION_STATUS.md` with exact commands, environment, counts and results. Clearly list any failures or untested cases.
9. Commit this verification checkpoint. Do not proceed to formations if migration or tests fail.

## Phase B — expand from the current five formations to 12

Current implementation has five shapes in `src/lineup.js`, and `src/simulation.js` applies a coarse mismatch penalty. Add these seven, retaining the existing five:

- 4-3-3
- 4-2-3-1
- 4-4-2
- 4-1-4-1
- 4-4-1-1
- 3-5-2
- 3-4-3
- 3-4-2-1
- 5-3-2
- 5-4-1
- 4-2-2-2
- 4-3-2-1

### Position model constraints

The current player position vocabulary is `GK, CB, LB, RB, DM, CM, AM, LW, RW, ST`. Do not silently invent new position codes in this feature. Use a clear formation slot mapping and document how wide midfield / wing-back slots are represented using existing roles. Do not create invalid lineups when a club lacks an exact-position player.

### Required behavior

- Formation must be persisted per club and used by lineup repair, match preview/strength calculation and server-side settlement consistently.
- Validate formation identifiers server-side against the 12-item allowlist.
- Changing formation must not duplicate players, drop players, alter ownership, or bypass the 13–26 squad limits.
- A valid XI must still contain exactly 11 unique owned players and a goalkeeper whenever the club owns a goalkeeper.
- Repair should prefer exact slot matches, then compatible role/line, then best remaining eligible player. It must not select the same player twice.
- Keep formation fit bounded and modest. Do not add an unconditional +4 bonus to every formation. Strength should reflect suitability and tactical trade-offs rather than formation-name advantage.
- Ensure equally rated squads in their intended shapes are not systematically advantaged merely because one shape has more slots compatible with the existing position vocabulary.
- A mismatched formation can have a cost, but cap the worst-case difference and justify it with tests.

### Formation balance tests

Add tests for all 12 formations covering:
1. Shape totals equal 11 and include exactly one GK.
2. Every slot mapping uses supported player position codes.
3. A suitable XI repairs to 11 unique players and remains valid.
4. Thin squads, missing wide players, missing DM/AM, no backup GK and unusual bench composition.
5. All 12 formations with equal OVR squads: no unexplained formation-name bias.
6. All 12 formations against equal and stronger/weaker opponents using fixed seeds and a large simulation sample.
7. Formation fit effect is bounded and monotonic with mismatch; no one formation gets a free advantage.
8. Match settlement uses the saved club formation, not a hard-coded default.
9. Invalid formation API values are rejected with no database mutation.
10. Existing formation and lineup tests remain green.

### UI and documentation

- Expose all 12 formations in the isolated management-game UI with a simple pitch/slot preview and clear formation name.
- Make formation selection usable on a 360px mobile viewport.
- Show the selected formation and ensure the saved selection is reflected after reload.
- Update API docs, balancing defaults, verification status and owner-approved phase document.

### Phase B completion criteria

Do not start player-to-player transfers or admin panel in this task. Finish only after:
- all tests above pass locally,
- mobile smoke tests pass,
- a short balance report compares all 12 formations,
- the code and test checkpoint is committed on this isolated branch,
- no production system has been touched.

Report exact commit SHA, test counts, migration results, and any limitations. If the existing UI or database schema cannot safely support this without a larger refactor, stop and explain the blocker rather than improvising.
