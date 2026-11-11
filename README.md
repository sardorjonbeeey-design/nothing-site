# ZAMIN FK — Management Game Guidelines

> Working project brief. This document records the current agreed direction, protects the existing project, and gives future development work a consistent reference. It is a living document: improve it as we build and test, but do not silently change agreed decisions.

## 1. Project direction

ZAMIN FK is evolving into a mobile-first football club management game inside the existing Telegram Mini App.

The game is about creating and managing a club, building a squad, developing players, competing in leagues, and improving the club over time.

It is **not** intended to be a fully user-controlled, real-time football simulator in the first version. Matches are automatically simulated and shown in an accelerated visual presentation.

## 2. Non-negotiable development and safety rules

These rules apply to every future task:

1. **Do not modify the existing project.** Do not edit, delete, rename, refactor, or replace existing files or systems.
2. **Do not work on the protected branch.** The existing `zamin-squad-test` branch is protected.
3. **Use isolated development only.** New experiments and implementation must happen on a separate branch and/or inside a clearly separate new directory.
4. **Do not connect the prototype to production.** No integration with the live Telegram Mini App, bot, production backend, production database, or live users.
5. **Do not deploy or merge.** Never merge, cherry-pick, deploy, connect, or transfer work into the existing game unless the owner explicitly approves that exact action.
6. **Inspect before building.** Read relevant existing code and database structure to understand what already exists, but inspection does not grant permission to modify it.
7. **Preserve existing work.** The city, stadium, 3D assets, supporter/member portal, applications, existing XP/economy, squad-related systems, bot, and admin tools must remain untouched.
8. **Keep a clear change boundary.** Before each task, state which new files/directories will be created. If a task appears to require modifying an existing file, stop and ask for approval; prefer a standalone prototype instead.
9. **No hidden production dependencies.** The isolated prototype must use mock data or its own explicitly separate test storage. Do not reuse production credentials or database tables.
10. **Owner approval is required for integration.** A working prototype is not permission to connect it.

Current isolated development branch: `zamin-management-isolated`  
Protected reference branch: `zamin-squad-test`

## 3. Club creation and identity

The intended club setup includes:

- Club name.
- Short name / abbreviation.
- Primary and secondary club colours.
- Optional club crest/logo upload.
- A default crest for users who do not upload one.

Logo creation should **not** require a built-in logo editor. Instead, provide a short editable prompt that users can copy and paste into Google or an external AI/image-generation tool, customize with their club name, colours and symbol, generate a crest externally, then return and upload it.

The club identity should be displayed consistently across relevant game screens (club dashboard, squad, transfers, fixtures, league table and opponent information).

Ownership limits, name-change rules, image storage provider and upload limits are implementation details to decide after inspection and prototype testing.

## 4. Players and squad

Players are virtual game entities, not real community members and not collectible card artwork.

- Do not create an individual collectible card image for every player.
- Players can have different quality levels / categories (for example, basic, developing, strong and elite). The exact names and balance are open to refinement.
- Player information can include name, nationality, age, position, overall rating, individual attributes, potential, development level and market value.
- Players are upgradeable.
- Player potential should matter so that development has limits and player identities remain distinct.
- The squad system should support a Starting XI, substitutes and reserves, while preserving any existing squad/community systems rather than replacing them.

The virtual player database must remain separate from real community members, supporter records and player applications. Real people must not automatically become purchasable or tradeable game players.

## 5. Game economy

All game money-related values must use **Uzbek so'm (UZS)**.

The game is expected to include:

- A starting club budget for newly created clubs.
- Player transfer prices and market values.
- Buying and selling virtual players.
- Future club costs and development expenses, if introduced.

The exact starting budget, transfer prices, wages and economic balance are **not decided yet**. Do not treat example numbers as approved values.

Keep the game economy separate from any existing supporter-portal currencies, donations, club funds, personal coins, Fan XP or Influence. Do not reuse or convert those existing values unless explicitly approved.

## 6. Player development points

Player development uses a separate points balance:

- Clubs earn development points from matches and missions.
- The points are held in a shared club balance.
- The club manager allocates points to individual players to upgrade them.
- Upgrades should improve specific attributes, not just increase an arbitrary overall number.
- Player potential and upgrade costs should help balance progression.

Development points are **not money** and should not automatically convert to UZS.

Exact point rewards, upgrade costs, caps and reset rules remain open for testing.

## 7. Missions and rewards

Matches are not the only progression activity. Missions can provide additional ways to earn development points.

Possible mission examples (ideas, not a finalized list):

- Play a match.
- Win a match.
- Score a target number of goals across matches.
- Complete a set number of matches.
- Complete a weekly objective.
- Use a specified formation or meet a squad-building challenge.

Mission rewards should encourage varied participation, not only winning. Avoid repetitive or exploitable tasks. Mission frequency, reward amounts and anti-abuse rules need balancing.

## 8. Matches and simulation

Matches use a simple pitch visualization with moving dots representing players.

- Matches are automatically simulated.
- The user can watch the match in an accelerated / speed-up view.
- The simulation should show basic movement and match events such as attacks, passes, shots and goals where feasible.
- Final results are influenced mostly by the relative strength and composition of the two clubs' squads.
- Randomness must still matter: a stronger squad should have a better chance, not a guaranteed win.
- Starting XI, player positions and formation can influence results as the system develops.

Do not build a full real-time, directly controlled football game for the initial version.

The match experience should be separate from the club-management interface, while remaining part of the same overall Mini App experience in a future approved integration. The match renderer should only load when needed and release resources when exited.

## 9. League and competition

- A league is created when **10 or more clubs have been created**.
- Before the threshold is reached, the game does not need to create the league.
- The initial competition can be a simple league format with fixtures, results and a standings table.
- The exact league size, season length, promotion/relegation, tie-breakers and handling of clubs joining after a season starts are still undecided.

Do not invent a fixed league size or season structure without a later decision.

## 10. Intended gameplay loop

1. Create and customize a club.
2. Receive the starting club budget.
3. Build a squad from the available virtual players.
4. Set the Starting XI, substitutes and formation.
5. Play automatically simulated matches.
6. Complete missions.
7. Earn development points.
8. Allocate points to upgrade players.
9. Improve the squad and compete in the league.
10. Continue developing the club as the game expands.

## 11. Suggested development phases

Build and test one small, independent piece at a time:

1. **Repository and system audit** — inspect current architecture, existing systems and data boundaries; report findings only.
2. **Standalone club setup prototype** — club name, short name, colours, optional crest upload flow and editable external logo prompt.
3. **Standalone player and squad prototype** — virtual player data, quality levels, attributes, potential and lineup selection.
4. **Standalone economy prototype** — UZS budget and safe mock transfer buy/sell flow.
5. **Standalone development prototype** — shared development points, missions and player attribute upgrades.
6. **Standalone match simulation prototype** — accelerated dot movement, match events and squad-influenced probabilistic results.
7. **Standalone league prototype** — league activation at 10+ clubs, fixtures, results and table.
8. **Review and integration proposal** — document what works, known issues, security considerations and exactly what integration would require. Wait for explicit owner approval before connecting anything.

Do not attempt to build every system in one large change. Test the smallest useful version first.

## 12. Engineering principles

- Mobile-first and suitable for Telegram's in-app browser.
- Keep management UI and match simulation as separate experiences/modules.
- Prefer simple, understandable mechanics over expensive or fragile complexity.
- Keep all authoritative economy, transfer, reward and match-result calculations on a trusted server when a backend is eventually approved.
- Validate ownership, balances, player availability and transactions server-side.
- Prevent duplicate purchases, overspending, duplicate rewards and client-side result manipulation.
- Use mock data and isolated test services during this phase.
- Do not introduce paid services or real-money purchases without explicit approval and a separate policy review.
- Record decisions, assumptions, unresolved questions and test results in this document as the project evolves.

## 13. Decisions still open

These are intentionally not finalized:

- Starting club budget in UZS.
- Initial squad size.
- Exact player quality categories and rating distribution.
- Initial player pool size and generation method.
- Transfer market refresh and availability rules.
- Player wages, contracts and recurring expenses.
- Development-point reward values and upgrade costs.
- Player attribute caps and potential rules.
- Mission schedule and reward balance.
- League size, season length and competition rules.
- Match duration, simulation speed and event frequency.
- Club ownership limits and club-name change rules.
- Logo file constraints and storage approach.

When proposing values, label them as proposals until the owner confirms them.

---

**Guiding principle:** Build a separate working prototype, learn from it, and improve the idea over time. Protect the existing ZAMIN FK project. Nothing is integrated without explicit approval.
