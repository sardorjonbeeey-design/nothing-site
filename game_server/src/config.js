export const config = {
 port: Number(process.env.PORT || 8080), nodeEnv: process.env.NODE_ENV || 'development',
 databaseUrl: process.env.DATABASE_URL || '',
  expectedDatabaseName: process.env.EXPECTED_DATABASE_NAME || 'zamin_game', webOrigin: process.env.WEB_ORIGIN || '',
 telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
 sessionSecret: process.env.SESSION_SECRET || '',
 sessionMaxAgeSeconds: Number(process.env.SESSION_MAX_AGE_SECONDS || 86400),
 telegramAuthMaxAgeSeconds: Number(process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS || 86400),
 allowDevAuth: process.env.ALLOW_DEV_AUTH === 'true',
 startingBudgetUzs: BigInt(process.env.STARTING_BUDGET_UZS || '0'),
 startingSquadSize: Math.floor(Math.max(11, Math.min(25, Number(process.env.STARTING_SQUAD_SIZE || 18)))),
 matchHomeAdvantage: Math.max(0, Math.min(0.15, Number(process.env.MATCH_HOME_ADVANTAGE || 0.06)))
};
if (config.startingBudgetUzs < 0n || config.startingBudgetUzs > 9223372036854775807n) throw new Error('STARTING_BUDGET_UZS is outside PostgreSQL BIGINT range');
if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('PORT is invalid');
if (!Number.isInteger(config.startingSquadSize) || config.startingSquadSize < 11 || config.startingSquadSize > 25) throw new Error('STARTING_SQUAD_SIZE must be an integer from 11 to 25');
if (!Number.isInteger(config.sessionMaxAgeSeconds) || config.sessionMaxAgeSeconds < 60) throw new Error('SESSION_MAX_AGE_SECONDS must be at least 60');
if (!Number.isInteger(config.telegramAuthMaxAgeSeconds) || config.telegramAuthMaxAgeSeconds < 60) throw new Error('TELEGRAM_AUTH_MAX_AGE_SECONDS must be at least 60');
if (!Number.isFinite(config.matchHomeAdvantage)) throw new Error('MATCH_HOME_ADVANTAGE is invalid');
