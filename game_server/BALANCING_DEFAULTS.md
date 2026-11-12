# Provisional game-balance defaults

These are implementation defaults used to make the isolated prototype playable. They are not owner-approved final game rules.

| System | Current implementation | Status |
|---|---|---|
| Starting budget | 20,000,000 UZS | Owner-approved |
| Starting squad | 18 generated academy players, identical for every club: XI 58, 56, 56, 54×4, 52×4; bench 50×3, 47×4 (GK 2, CB 3, LB 1, RB 1, DM 2, CM 3, AM 1, LW 1, RW 1, ST 3) | Owner-approved |
| Squad size | Minimum 13, maximum 26 | Owner-approved |
| One club per user | Enforced by the server and a unique database index | Owner-approved |
| Transfer market | 360 seeded fictional players rated 46–74, plus generated youth | Provisional content |
| Youth supply | The market always holds a free generated player rated 45–50 for each of 12 position slots | Owner-approved |
| Market value | 30,000,000 × 1.10^(overall − 80) UZS, rounded to 10,000 | Owner-approved |
| Player sale price | Academy players 50% on their first sale; every other sale 80% | Owner-approved |
| League income | 750,000 UZS per completed league match, no win or draw bonus | Owner-approved |
| Waiting-list stipend | 750,000 UZS per completed league matchday to every club outside that league (18 per season) | Owner-approved |
| Friendly income | None | Owner-approved |
| Potential | Catalogue: overall + 8–20, capped at 92. Academy: overall + 12. Youth: overall + 10 | Provisional |
| Quality tiers | Below 54, below 62, below 69, 69+ (shown as Prospect, Developing, Established, Elite) | Provisional |
| Attribute templates | Fixed offsets per position that sum to zero, so attributes average exactly to overall | Owner-approved |
| Overall after upgrades | Rounded-down average of the six attributes, capped by potential: +1 overall per 6 attribute points | Owner-approved |
| Attribute upgrade | 1–5 levels per request; cost per level = 2 + floor(current attribute / 10) DP | Provisional |
| Attribute ceiling | Individual attribute cannot exceed player potential | Provisional |
| Match reward | 2 DP per completed league match per club (friendlies pay nothing) | Provisional |
| Mission rewards | 5–12 DP depending on objective; one-off, not reset each season | Provisional |
| Match strength | Average Starting XI overall, fitness factor, formation fit of −4 to +4 | Provisional |
| Match model | Goal share = 1 / (1 + 10^(−(home + 2 − away) / 40)); home advantage is +2 rating points | Owner-approved, verified in tests |
| Lineup repair | A sold starter is replaced automatically (same position, then same line, then best remaining; goalkeeper for goalkeeper); every XI is re-checked before a match | Owner-approved |
| Season rollover | Next season starts 2 rest days after day 19 (21-day cycle) with the same ten clubs; cash, squads, upgrades and history are kept | Owner-approved |
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
Rows marked Owner-approved were approved on 2026-11-11 and 2026-11-12. The owner should still approve player tier thresholds, DP rewards and upgrade costs. Do not silently treat these prototype defaults as final.
