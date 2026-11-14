export const config = {
 port: Number(process.env.PORT || 8080), nodeEnv: process.env.NODE_ENV || 'development',
 databaseUrl: process.env.DATABASE_URL || '',
  expectedDatabaseName: process.env.EXPECTED_DATABASE_NAME || 'zamin_game', webOrigin: process.env.WEB_ORIGIN || '',
 telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
 sessionSecret: process.env.SESSION_SECRET || '',
 superAdminTelegramId: process.env.SUPER_ADMIN_TELEGRAM_ID || '',
 sessionMaxAgeSeconds: Number(process.env.SESSION_MAX_AGE_SECONDS || 86400),
 telegramAuthMaxAgeSeconds: Number(process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS || 86400),
 allowDevAuth: process.env.ALLOW_DEV_AUTH === 'true',
 // How often an idle scheduler re-checks for newly created fixtures. It never changes kick-off or settlement times.
 schedulerMaxIdleMs: Math.max(200, Math.min(60000, Number(process.env.SCHEDULER_MAX_IDLE_MS) || 15000))
};
if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('PORT is invalid');
if (!Number.isInteger(config.sessionMaxAgeSeconds) || config.sessionMaxAgeSeconds < 60) throw new Error('SESSION_MAX_AGE_SECONDS must be at least 60');
if (!Number.isInteger(config.telegramAuthMaxAgeSeconds) || config.telegramAuthMaxAgeSeconds < 60) throw new Error('TELEGRAM_AUTH_MAX_AGE_SECONDS must be at least 60');
