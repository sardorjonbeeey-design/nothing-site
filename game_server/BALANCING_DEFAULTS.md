# Provisional game-balance defaults

These are implementation defaults used to make the isolated prototype playable. They are not owner-approved final game rules.

| System | Current implementation | Status |
|---|---|---|
| Starting budget | 0 UZS | OPEN — set STARTING_BUDGET_UZS after approval |
| Starting squad | 18 fictional free agents | Provisional, configurable 11–25 |
| Player ratings | 46–74 overall at market seed | Provisional |
| Potential | Overall + 8–20, capped at 92 | Provisional |
| Quality tiers | Academy below 54; Developing below 62; Established below 69; Elite 69+ | Provisional |
| Market value | Overall × overall × 17,000 UZS | Provisional |
| Player sale price | 80% of current market value | Provisional |
| Attribute upgrade | 1–5 levels per request; cost per level = 2 + floor(current attribute / 10) DP | Provisional |
| Attribute ceiling | Individual attribute cannot exceed player potential | Provisional |
| Match reward | 2 DP per completed league match per club (friendlies pay nothing) | Provisional |
| Mission rewards | 5–12 DP depending on objective | Provisional |
| Match strength | Average Starting XI overall, fitness factor, small formation bonus and home advantage | Provisional |
| Home advantage | 6% | Provisional |
| League threshold | 10 created clubs | Owner-approved |
| League format | First 10 clubs, home and away against every opponent: 18 rounds, 90 fixtures | Owner-approved |
| League calendar | One round per day: matchdays 1–9, rest day on day 10, matchdays 11–19 | Owner-approved |
| League kick-off | 20:00 Asia/Tashkent; all five fixtures of a matchday start together | Owner-approved |
| Match duration | 60 seconds; settled by the server at kick-off + 60 s | Owner-approved |
| Season start | Day 1 is the next Asia/Tashkent calendar day after the 10th club is created | Provisional |
| Friendly rewards | None: no DP, no mission progress, no standings | Provisional |
| Friendly opponents | Clubs of the same owner cannot play each other | Provisional |
| Friendly request window | Kick-off 2 minutes to 30 days ahead, whole minutes; at most 10 pending requests per club | Provisional |

All player identities are fictional. The seed market currently generates Uzbek-nationality fictional players.

## Important economy boundary
UZS and Development Points are stored and tracked separately. UZS transactions are written to money_ledger; DP earnings and spending are written to development_ledger. Neither resource can be converted into the other.

## Before launch
The owner should approve the starting budget, transfer pricing, starting squad size, player tier thresholds, DP rewards, upgrade costs and league format. Do not silently treat these prototype defaults as final.
