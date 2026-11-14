# 2026 Uzbekistan Super League real-player catalogue

Checked: 14 November 2026. The game catalogue contains 236 curated real players across all 16 Super League clubs (68 of them have recorded DOB sources from PFL records). It is a playable selection, not a claim that the full 2026 league roster has been imported.

## Roster affiliation sources

Latest published PFL Super League matchday 27 team sheets used for club affiliation:

- Neftchi / OKMK: https://pfl.uz/en/match/3994
- Pakhtakor / Qo'qon-1912: https://pfl.uz/en/match/3996
- Mash'al / Surkhon: https://pfl.uz/en/match/3986
- Sogdiana / Dinamo Samarqand: https://pfl.uz/en/match/4003
- Qizilqum / Navbahor: https://pfl.uz/en/match/3989
- Andijon / Lokomotiv: https://pfl.uz/en/match/3992
- Bunyodkor / Xorazm: https://pfl.uz/en/match/3998
- Buxoro and Nasaf: official PFL club records at https://pfl.uz/en/club/8 and https://pfl.uz/en/club/4, supplemented by current player profiles.

Player dates of birth were cross-checked against PFL player profiles and, where those were unavailable or stale, official club profiles, Transfermarkt or Sofascore. The source note is stored on each player row. Club affiliation is taken from the current matchday/club record, not blindly copied from stale profile club labels.

## Club crests

Club crests are NOT used. They are third-party trademarks. The API and client show a neutral three-letter club badge instead. Crest URLs are not written to the database (the real_club_crest_url column stays empty).

## Launch status and permissions

- Real players are shown in the transfer market only while `REAL_PLAYERS_ENABLED` is not `false`. Set it to `false` in any public deployment until written rights and permissions are obtained from the relevant rights holders.
- Dates of birth are stored for age calculation only. The market API returns the current age, never the date of birth.
- The client states that the game is unofficial and not affiliated with or endorsed by the league, any club or any player.

## Game-only values

OVR, attributes, potential and UZS asking prices are balancing values created for the management game. They are not official player ratings, real-world transfer values or salary figures. Player ages are recalculated from real_player_dob when the market is read.
