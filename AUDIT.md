# ZAMIN FK Management Game — Initial Repository Audit

**Audit status:** Initial read-only pass  
**Reference repository:** `sardorjonbeeey-design/shon-sharaf`  
**Reference branch inspected:** `zamin-squad-test`  
**Isolated working branch:** `zamin-management-isolated`  
**Audit date:** 2026-11-11

## 1. Scope and safety

This audit reads the existing repository to understand its boundaries. It does not authorize changes to existing systems.

The management-game work must remain isolated under `ZAMIN_FK_MANAGEMENT/` on `zamin-management-isolated`. Existing files and folders are protected. No production credentials, database tables, APIs, bot routes, or live users may be used by the prototype.

## 2. Existing architecture observed

### Existing city server

The inspected `web/city/server.js` is an Express application. It:

- Loads the Telegram bot module and mounts its webhook.
- Validates Telegram Mini App init data for authenticated API actions.
- Uses PostgreSQL when `DATABASE_URL` is configured and in-memory storage otherwise.
- Creates and serves the existing city/stadium experience.
- Serves static assets from the stadium build.
- Initializes existing club/supporter and economy modules.

This is a live application entry point and must not be edited for the management game prototype.

### Existing supporter portal

The inspected `web/city/club.js` describes and implements the supporter portal. Its concepts include:

- Members and permanent stadium seats.
- Fan XP and supporter tiers.
- Influence and departments.
- Contributions, missions and referrals.
- Shared supporter club funds.
- Applications and admin decisions.

These are community/supporter features, not the new virtual football-management game's club/player progression system. They must remain separate.

### Existing city economy

The inspected `web/city/economy.js` implements a roleplay economy:

- Personal coin wallets.
- Daily bonus and streaks.
- Work shifts and customer serving.
- House upgrades and car purchases.
- Server-side transaction handling.

Its coins are not the management game's UZS budget. The new game must have its own isolated economy model and must not reuse existing wallet balances, ledger, house or car systems.

### Existing Telegram bot

The inspected `web/city/bot.js` handles the current Telegram webhook, welcome message, Mini App button and start payload hooks. The new prototype must not mount routes on, change, or reconfigure this bot.

### Existing stadium

The repository has a separate `web/stadium` directory. The city server serves its built frontend and related assets. Existing stadium source, build output, models, vendor files, maps and 3D assets are protected.

## 3. Separation requirements for the new game

The new management game should be treated as a separate application prototype with its own:

- UI entry point.
- Styles and assets.
- Mock data.
- Game domain models.
- Match simulation logic.
- Local/test-only persistence, if required.

The prototype must not import or call the existing city server, bot, supporter portal, economy module or production database. It must not share their tables or balances.

Potential future integration is a separate decision and is outside this audit.

## 4. Proposed isolated folder layout

The following is a proposal for new files only. It is not yet a claim that these files exist.

```text
ZAMIN_FK_MANAGEMENT/
├── README.md
├── AUDIT.md
├── decisions/
│   └── OPEN_QUESTIONS.md
├── prototype/
│   ├── README.md
│   ├── index.html
│   ├── styles/
│   ├── scripts/
│   └── assets/
└── tests/
    └── TEST_PLAN.md
```

The first prototype should be self-contained and runnable independently. Avoid adding dependencies to the existing root or `web/city` package.

## 5. Initial technical recommendation

For the first phone-testable prototype, prefer a lightweight standalone web page using plain HTML, CSS and JavaScript with mock data. This avoids changing existing package manifests, backend services or deployment configuration.

Build the first thin vertical slice in this order:

1. Club creation screen: name, short name, colours and crest upload preview.
2. Club dashboard: show the created identity and mock club budget in UZS.
3. Squad screen: show a small sample of virtual players with position, attributes, quality and potential.
4. Lineup selection: choose a Starting XI and formation.
5. Only after those screens work, add development points and attribute upgrades.
6. Add the dot-based match simulation after squad/lineup data is stable.

This is a recommendation for an isolated prototype, not an approval to integrate or deploy it.

## 6. Known risks and boundaries

- **Currency collision:** existing personal coins and supporter Club Funds must not be treated as game UZS.
- **Identity collision:** real supporter/member/player-application records must not automatically become virtual game players or club owners.
- **Authentication:** do not reuse production Telegram initData, bot credentials or live auth routes in this standalone prototype.
- **Data isolation:** do not connect to the production Neon database or create/alter production tables.
- **Frontend coupling:** do not edit the existing stadium build, shared styles or city UI.
- **Performance:** keep the match visualization isolated and load it only when the user opens a match.
- **Economy integrity:** if a backend is added later, money, transfers, missions and match results must be validated server-side.

## 7. What this audit has not established

This is an initial audit, not a full security or code-quality review. It has not verified:

- Every frontend file and asset dependency.
- Full database schema and all migrations.
- Existing deployment configuration and environment-variable inventory.
- Every API route and authorization rule.
- Full browser compatibility or mobile performance.
- The exact safe integration boundary for a future release.

Those questions require further read-only inspection before any integration proposal.

## 8. Next isolated task

Create the standalone prototype shell only inside:

`ZAMIN_FK_MANAGEMENT/prototype/`

Start with the club creation and dashboard flow using mock data. Do not add a backend, Telegram authentication, production dependencies, or integration hooks. Do not change any existing file.
