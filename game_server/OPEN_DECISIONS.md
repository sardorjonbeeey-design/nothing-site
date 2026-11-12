# Remaining owner decisions before launch

The software foundation is prepared, but these game-design and activation choices remain intentionally open.

## Game balance
- Opening club budget in UZS.
- Whether the default 18-player starting squad is correct.
- Player quality-tier names and rating thresholds.
- Market-value formula and player sale percentage.
- Attribute upgrade cost curve and potential cap.
- DP awarded per match and mission reward values.
- Whether wages, stadium expenses or other recurring club costs belong in the first release.

- DECIDED: one club per user.
- DECIDED (2026-11-12): 20M budget, price curve, 50%/80% resale, 750,000 UZS league income and waiting stipend, squad 13–26, generated youth supply, lineup repair, attribute offsets, match model S=40 with +2 home advantage, automatic next season. See BALANCING_DEFAULTS.md.
- Open: a running cost (for example wages) for later seasons, when cash would otherwise pile up.
- Open: how waiting clubs ever enter a league (second league or promotion); today they wait indefinitely and receive the stipend.
- Open: the real-player database (data rights, source access, unique players versus copies). Not implemented; all players are fictional.
- Open: whether missions reset each season.

## Competition
- DECIDED: 10-club double round-robin, one match per club per day at 20:00 Asia/Tashkent, 60-second matches, rest day on day 10, server-only settlement, friendlies by accepted challenge.
- Confirm the provisional choices made while implementing this: season starts the next Tashkent day; friendlies give no rewards; no friendlies between clubs of one owner.
- Decide whether the pitch with moving dots (approved earlier) should return for the 60 seconds a match is live; the old decorative pitch was tied to the removed Play button and is no longer shown.
- Decide whether lineups are frozen at kick-off. Today the lineup saved at settlement (kick-off + 60 s) is used.
- Decide how clubs created after the first league begins should join: next season or a later league.
- Decide season length, tie-breakers and season reset/reward rules.

## Infrastructure and account activation
- Keep Neon for a separate game database or choose another PostgreSQL provider.
- Confirm Oracle Cloud availability in the chosen region or select another compute host.
- Choose a domain/subdomain and configure DNS.
- Provide Telegram bot token only when ready to enable the isolated authentication adapter.
- Confirm backup retention and recovery expectations.

## Not required for first technical activation
- Production integration with the existing Mini App.
- Existing bot or backend code changes.
- Existing Neon database access.
- Real-money purchases or advertising.
- Live-user access before security and load checks.

These decisions are not blockers for reviewing the source, but some are required before a balanced public launch.
