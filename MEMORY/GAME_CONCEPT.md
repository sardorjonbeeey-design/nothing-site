# Game Concept

Status: working baseline, not a frozen final specification.

## Core fantasy
Build a football club from its identity and early squad into a competitive club. Make decisions about players, money, development and matches.

## Gameplay loop
1. Create club identity.
2. Receive starting budget (amount OPEN).
3. Build a squad of virtual players.
4. Choose Starting XI, substitutes and formation.
5. Watch automatically simulated matches in accelerated view.
6. Complete missions and earn player-development points.
7. Allocate points to improve selected players.
8. Use UZS for transfers and other approved expenses.
9. Improve the squad and compete in a league after the club threshold is reached.

## Club identity
Club name, short name, primary and secondary colours, optional crest upload and default crest. No built-in crest editor. Give users an editable prompt for an external image-generation tool, then let them upload the result.

## Players and squad
Virtual players may have position, age, nationality, quality, overall rating, individual attributes, potential and market value. Players are upgradeable. Potential should constrain progression. Quality categories are not collectible card artwork. Starting XI, substitutes and reserves are expected; exact squad size is OPEN.

## Economy
All game money uses Uzbek so'm (UZS). Money and development points are separate. Starting budget, transfer fees and operating costs are undecided. Do not reuse Mini App coins, Fan XP, Influence, supporter funds or community balances.

## Player development
Matches and missions can award development points. Points sit in a shared club balance and the manager allocates them to individual players. Upgrades should target attributes. Potential and costs should make development strategic.

## Missions
Examples, not a final list: play matches, win, score a target number of goals, complete matches, use a formation, sign a player or complete weekly objectives. Encourage varied activity and avoid reward farming.

## Matches
Simple pitch with moving dots representing players; accelerated playback; movement, passing, attacks, defending, shots and goals. Results are randomized but depend mostly on relative squad strength. Stronger squads have better odds, not guaranteed wins. Formation, positions and lineup may influence outcomes later.

## League
Create a league when 10 or more clubs exist. Below 10, no league is required. Format, season structure and maximum size are OPEN.

## Separate resources
- UZS: club finances, budget, transfers and future costs.
- Development Points (DP): player progression and attribute upgrades.

## Interface position
The game concept and memory are independent from Telegram Mini App. The current prototype is a standalone browser experiment with mock data. This does not approve connection to Telegram or a production backend.
