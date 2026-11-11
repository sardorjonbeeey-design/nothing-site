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
| Match reward | 2 DP per completed league match per club | Provisional |
| Mission rewards | 5–12 DP depending on objective | Provisional |
| Match strength | Average Starting XI overall, fitness factor, small formation bonus and home advantage | Provisional |
| Home advantage | 6% | Provisional |
| League threshold | 10 created clubs | Owner-approved |
| League format | First 10 clubs, one round-robin, 9 rounds | Provisional |

All player identities are fictional. The seed market currently generates Uzbek-nationality fictional players.

## Important economy boundary
UZS and Development Points are stored and tracked separately. UZS transactions are written to money_ledger; DP earnings and spending are written to development_ledger. Neither resource can be converted into the other.

## Before launch
The owner should approve the starting budget, transfer pricing, starting squad size, player tier thresholds, DP rewards, upgrade costs and league format. Do not silently treat these prototype defaults as final.
