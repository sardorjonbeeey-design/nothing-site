# Isolated game server deployment — Oracle Cloud

This guide is for the owner to complete after the source and tests are ready. No account, VM, database or DNS resource has been created or connected by this repository work.

## Required resources
- One Linux VM with a supported Node/Docker runtime; an Oracle Ampere A1 Always Free VM is the first option to check, subject to regional capacity and account eligibility.
- A separate Neon PostgreSQL project for the game only, with its database named zamin_game.
- A domain or subdomain pointed to the VM public IP.
- Telegram bot token only when the owner approves the isolated Mini App authentication connection.

## VM preparation
1. Create the VM in Oracle Cloud. Prefer Ubuntu 24.04 ARM64 if using Ampere.
2. Configure the VM with a persistent boot volume. Keep uploaded crest files in the named Docker volume.
3. Allow inbound TCP 22 only from the owner's trusted IP, and TCP 80/443 for the web service. Do not expose PostgreSQL publicly.
4. Install Docker Engine and the Docker Compose plugin using the official Ubuntu instructions.
5. Point the chosen DNS A record to the VM public IP and wait for DNS propagation.

## Environment
1. In this directory, copy .env.example to .env.
2. Set DATABASE_URL to the connection string of the separate Neon project, using the zamin_game database name. Keep the password private.
3. Keep EXPECTED_DATABASE_NAME=zamin_game. The server, migration runner and seed script refuse to proceed if current_database() does not match this isolated name.
4. Set GAME_DOMAIN to the chosen hostname.
5. Set WEB_ORIGIN to https:// followed by the same hostname.
6. Set SESSION_SECRET to a random secret of at least 32 characters.
7. Set TELEGRAM_BOT_TOKEN only after the owner explicitly approves connecting this isolated app to a bot.
8. Keep ALLOW_DEV_AUTH=false in production.
9. Set STARTING_BUDGET_UZS only after the opening budget has been approved. It currently defaults to zero.

## Launch
From the game_server directory:
1. docker compose build
2. docker compose up -d game-server
3. docker compose run --rm --no-deps game-server npm run db:migrate
4. docker compose run --rm --no-deps game-server npm run db:seed
5. docker compose up -d
6. Open https://YOUR_GAME_DOMAIN/ and verify /health returns ok.

Caddy obtains and renews HTTPS certificates automatically when DNS and ports are configured correctly.

## Operational safety
- Use a dedicated Neon project; never point DATABASE_URL at the existing Mini App database.
- Back up the Neon project and the Docker volume containing uploads.
- Keep the VM, database and Telegram credentials private.
- Do not enable development authentication on the public server.
- Review security headers, logs, rate limits, database connection limits, backups and restore procedure before inviting users.
- The free tier is not a production availability guarantee. Capacity, ARM compatibility, quotas and account eligibility must be verified in the actual Oracle region.
