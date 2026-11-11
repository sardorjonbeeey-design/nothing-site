# ZAMIN FK Management — cloud architecture

## Separation of responsibilities

```
Telegram Mini App / browser
          |
          | HTTPS
          v
Oracle Cloud VM (candidate)
  - Caddy HTTPS reverse proxy
  - Node.js game API
  - Club and player rules
  - Transfer and DP settlement
  - Match simulation and league logic
  - Mobile game client static files
  - Persistent crest-upload volume
          |
          | TLS PostgreSQL connection
          v
Dedicated PostgreSQL database (Neon candidate)
  - Game users
  - Clubs and budgets
  - Players and lineups
  - Money and DP ledgers
  - Missions
  - Leagues and fixtures
```

The game database must be a separate database named zamin_game. The existing Mini App database is not a valid target.

## Resource expectations

The first version is a 2D management game. It does not render 3D stadiums or run a real-time physics simulation on the server. Match simulation calculates a small amount of squad and event data, so the application process should be relatively light compared with a real-time multiplayer shooter or 3D game server.

The initial deployment can start with a small VM and be measured. Oracle Ampere A1 is a candidate because its free capacity may provide more CPU/RAM than this first version needs. Actual free capacity and region availability must be checked in the owner's account.

PostgreSQL compute and storage are separate from VM RAM. Increasing VM memory does not automatically increase Neon database compute. Increase the VM only if application CPU/RAM metrics show pressure; increase database compute/storage only if database metrics show pressure.

## Current safeguards
- PostgreSQL connection pool maximum: 8.
- Idle DB connections close after 30 seconds.
- Server-side transfer and match settlement use transactions and row locks.
- Rate limits are applied at the application layer.
- Crest uploads are limited to 2 MB each and stored on a persistent Docker volume.
- Database identity is checked against EXPECTED_DATABASE_NAME before readiness, migrations and seeding.
- No production database, bot, Mini App backend or live community system is imported or connected.

## Scaling limits to address before growth
- The first version uses in-memory rate-limit buckets. Multiple application instances need a shared rate limiter.
- Crest images currently live on one VM volume. Multiple app instances need shared object storage.
- League generation and match settlement are transactionally safe for the initial single-server deployment; load testing is required before horizontal scaling.
- Add monitoring, alerts, backup verification, restore drills and capacity measurements before public launch.
