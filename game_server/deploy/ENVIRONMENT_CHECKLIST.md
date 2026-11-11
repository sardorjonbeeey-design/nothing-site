# Environment and activation checklist

- [ ] Dedicated Neon project created for this game.
- [ ] Neon connection string added privately to .env.
- [ ] Oracle VM created and reachable.
- [ ] Docker and Compose installed.
- [ ] DNS points to the VM.
- [ ] GAME_DOMAIN set.
- [ ] WEB_ORIGIN set to the exact HTTPS origin.
- [ ] SESSION_SECRET generated privately (32+ random characters).
- [ ] Telegram bot token supplied only after explicit integration approval.
- [ ] STARTING_BUDGET_UZS approved and configured.
- [ ] ALLOW_DEV_AUTH=false.
- [ ] Database migration completed.
- [ ] Player and mission seed completed.
- [ ] Server health check passes.
- [ ] HTTPS certificate issued.
- [ ] Telegram Mini App launch URL configured by the owner.
- [ ] Backups and restore tested.
- [ ] Load and security checks completed.
- [ ] Owner approves opening to real users.

Never commit .env, database credentials, bot tokens or session secrets.
