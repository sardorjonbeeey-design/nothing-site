# Approved Decisions

Only decisions explicitly accepted by the owner belong here.

## Game
1. APPROVED — Start building a small version now and improve the concept through testing.
2. APPROVED — Football club management game, not directly controlled real-time football in the initial version.
3. APPROVED — Matches use a simple pitch with moving dots and accelerated / speed-up view.
4. APPROVED — Match results are randomized but depend mostly on squad level; stronger squads have better odds, not guaranteed wins.
5. APPROVED — Create a league when 10 or more clubs have been created.

## League schedule and matches (approved 2026-11-11)
19. APPROVED — 10-club league, home and away against every opponent: 18 matchdays. Matchdays 1–9, full rest day on day 10, matchdays 11–19; 19 calendar days.
20. APPROVED — Each club plays exactly one league match per day. All five fixtures kick off at 20:00 Asia/Tashkent (IANA zone, not server local time).
21. APPROVED — A match lasts exactly 60 seconds; the server settles all five at 20:01 whether or not anyone is online. Users cannot start, delay, accelerate, replay or settle league matches.
22. APPROVED — Friendlies use a challenge with a proposed date and time; only accepted requests create fixtures; they never change standings and must not overlap either club's one-minute league slot or other fixtures.
23. APPROVED — On opening, the game shows the club's latest completed match first, with access to the report and earlier results; history and viewed state are stored server-side; opening never triggers simulation.
Note: decision 3 (accelerated / speed-up view) is superseded for league matches by the fixed 60-second, server-settled match.

## Economy, seasons and match model (approved 2026-11-12)
24. APPROVED — 20,000,000 UZS starting budget; 18-player starting squad; squad minimum 13, maximum 26.
25. APPROVED — Player price 30,000,000 × 1.10^(OVR − 80) UZS.
26. APPROVED — Academy players sell for 50% on their first sale; transfer-market players for 80%. Sold academy players stay on the market.
27. APPROVED — 750,000 UZS per completed league match; no win or draw bonus; no friendly income.
28. APPROVED — Waiting-list stipend: 750,000 UZS per equivalent league matchday, 18 per season.
29. APPROVED — Season 2 starts automatically after 2 rest days; the ten league clubs keep their places; waiting clubs keep waiting; clubs keep cash, squads, upgrades and history.
30. APPROVED — Generated 45–50 OVR players are always available on the market.
31. APPROVED — One club per user.
32. APPROVED — Automatic lineup replacement after a starter is sold.
33. APPROVED — Attribute offsets per position that sum to zero; attributes average exactly to OVR.
34. APPROVED — Match engine: scale S = 40 with home advantage +2 (verified in tests).
Pending, not approved: real-player database (rights and data source unresolved); real photographs are excluded in any case.

## Club and players
6. APPROVED — Club identity includes name and crest/logo upload.
7. APPROVED — No in-game logo editor; provide an editable external-generation prompt and upload flow.
8. APPROVED — Players are upgradeable.
9. APPROVED — Player “cards” means quality categories/tiers, not unique collectible artwork for every player.
10. APPROVED — Player upgrades use development points earned through matches and missions.
11. APPROVED — Shared club development-point balance allocated by the manager to individual players. Owner responded “Great” to this model.

## Economy
12. APPROVED — Game money values use Uzbek so'm (UZS).
13. APPROVED — UZS and development points are separate resources.

## Memory and isolation
14. APPROVED — Keep written project memory / guidelines for main ideas and decisions.
15. APPROVED — Written project memory must be independent from Telegram Mini App.
16. APPROVED — Continue on branch zamin-management-isolated.
17. APPROVED — Do not modify existing code or systems; create new work in new files or an isolated branch/workspace.
18. APPROVED — Do not connect, integrate, merge or deploy new work to existing Mini App or production without explicit approval.

## Still unapproved
Exact player tiers, real-player rating formula and database, wages, DP rewards/costs, how waiting clubs enter a league, authentication, hosting and future interface integration.
