# Phone-first activation guide

This guide is written for completing the owner's cloud setup from an Android phone. No code editing is required beyond filling private environment values.

## 1. Create the database
1. Open Neon in the phone browser and create a new PostgreSQL project for ZAMIN FK Management.
2. Do not select or reuse the database/project used by the existing Mini App.
3. Name the database zamin_game.
4. Copy the PostgreSQL connection string for zamin_game. Keep it private.

## 2. Create the compute server
1. Open Oracle Cloud Console in the phone browser.
2. Check whether an Always Free Ampere A1 VM is available in the selected region. Free capacity is not guaranteed.
3. Create an Ubuntu ARM64 VM and retain its public IP.
4. Allow inbound TCP 80 and 443. Restrict SSH (TCP 22) to your own IP where possible.
5. Point a domain or subdomain A record to the VM public IP.

## 3. Open a terminal from Android
Use Oracle Cloud's browser Cloud Shell if available, or connect to the VM using an SSH app on the phone. Install Docker Engine and Docker Compose on the VM using the official Ubuntu instructions.

## 4. Download this isolated branch
Run:
```bash
git clone --branch zamin-management-isolated https://github.com/sardorjonbeeey-design/shon-sharaf.git
cd shon-sharaf/ZAMIN_FK_MANAGEMENT/game_server
cp .env.example .env
```

## 5. Fill private environment values
Open the .env file in a terminal editor and set:
- DATABASE_URL — the new zamin_game connection string.
- EXPECTED_DATABASE_NAME=zamin_game.
- GAME_DOMAIN — your chosen hostname, without https://.
- WEB_ORIGIN — https:// followed by that hostname.
- SESSION_SECRET — generate a private random value with: openssl rand -hex 32
- TELEGRAM_BOT_TOKEN — leave empty until the owner approves the isolated Telegram authentication connection.
- STARTING_BUDGET_UZS — keep 0 until the opening budget is approved.
- ALLOW_DEV_AUTH=false.

Never paste credentials into ChatGPT, GitHub commits, screenshots or public messages.

## 6. Build and initialize
From the game_server directory:
```bash
docker compose build
docker compose up -d game-server
docker compose run --rm --no-deps game-server npm run db:migrate
docker compose run --rm --no-deps game-server npm run db:seed
docker compose up -d
```

## 7. Verify
Open:
- https://YOUR_GAME_DOMAIN/ — game client
- https://YOUR_GAME_DOMAIN/health — process liveness
- https://YOUR_GAME_DOMAIN/ready — database identity and readiness

The ready route must return ok and database=true. If it does not, stop and check the DATABASE_URL and EXPECTED_DATABASE_NAME before proceeding.

## 8. Keep it isolated
Do not add this URL to the existing bot or Mini App until the owner explicitly approves that exact integration. First test with a separate test bot or a controlled private setup. Do not invite public users before backups, restore, security and load checks are complete.
