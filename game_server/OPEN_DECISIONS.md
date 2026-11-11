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

- Whether one user may own one club only or multiple clubs. The prototype currently permits multiple clubs, so this must be decided before a public league to prevent one owner filling multiple league places.

## Competition
- Confirm the provisional 10-club single round-robin league.
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
