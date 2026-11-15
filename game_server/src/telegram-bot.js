import { setTimeout as delay } from 'node:timers/promises';

const API = 'https://api.telegram.org';

function botUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('WEB_APP_URL must be a valid HTTPS URL'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('WEB_APP_URL must be a public HTTPS URL');
  return url.toString();
}

async function telegramCall(token, method, payload, fetchImpl = fetch, signal) {
  const response = await fetchImpl(`${API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    ...(signal ? { signal } : {})
  });
  const data = await response.json();
  if (!response.ok || data.ok !== true) {
    const error = new Error(data.description || `Telegram API request failed (${response.status})`);
    error.telegramErrorCode = data.error_code || response.status;
    throw error;
  }
  return data.result;
}

export async function replyToTelegramUpdate(update, { token, webAppUrl, superAdminTelegramId = '', fetchImpl = fetch }) {
  const message = update?.message;
  if (!message?.chat?.id || typeof message.text !== 'string' || message.from?.is_bot) return false;

  const command = message.text.trim().split(/\s+/, 1)[0].split('@', 1)[0].toLowerCase();
  if (command === '/admin') {
    // Owner only: other users get no reply, so the command does not reveal that the panel exists.
    if (!superAdminTelegramId || String(message.from?.id) !== String(superAdminTelegramId) || message.chat.type !== 'private') return false;
    await telegramCall(token, 'sendMessage', {
      chat_id: message.chat.id,
      text: 'Owner admin panel',
      reply_markup: { inline_keyboard: [[{ text: 'Open admin panel', web_app: { url: botUrl(new URL('admin', webAppUrl).toString()) } }]] }
    }, fetchImpl);
    return true;
  }
  if (!['/start', '/game', '/help'].includes(command)) return false;

  const privateChat = message.chat.type === 'private';
  const text = privateChat
    ? 'Welcome to ZAMIN FK Management Game!\n\nCreate your own club, build your squad, develop players and compete in the league.\n\nYour game account is linked to your Telegram account.'
    : 'To open ZAMIN FK Management Game, start a private chat with @zamingame_bot.';

  const payload = { chat_id: message.chat.id, text };
  if (privateChat) {
    payload.reply_markup = {
      inline_keyboard: [[{ text: '⚽ Open ZAMIN FK Game', web_app: { url: botUrl(webAppUrl) } }]]
    };
  }
  await telegramCall(token, 'sendMessage', payload, fetchImpl);
  return true;
}

export function startTelegramBot({ token, webAppUrl, superAdminTelegramId = '', fetchImpl = fetch, logger = console }) {
  if (!token) {
    logger.warn('Telegram bot is disabled: TELEGRAM_BOT_TOKEN is not configured');
    return { stop: async () => {} };
  }
  if (!webAppUrl) {
    logger.error('Telegram bot is disabled: WEB_APP_URL is not configured');
    return { stop: async () => {} };
  }

  const appUrl = botUrl(webAppUrl);
  let stopped = false;
  let pollingTask;

  const poll = async () => {
    let offset = 0;
  logger.info('Starting Telegram bot connection');
  while (!stopped) {
    try {
      const setupSignal = AbortSignal.timeout(15000);
      await telegramCall(token, 'deleteWebhook', { drop_pending_updates: false }, fetchImpl, setupSignal);
      const me = await telegramCall(token, 'getMe', {}, fetchImpl, AbortSignal.timeout(15000));
      await telegramCall(token, 'setMyCommands', {
        commands: [
          { command: 'start', description: 'Open ZAMIN FK Management Game' },
          { command: 'game', description: 'Open the game' },
          { command: 'help', description: 'Show game information' }
        ]
      }, fetchImpl, AbortSignal.timeout(15000));
      logger.info(`Telegram bot connected as @${me.username || 'bot'}`);
      break;
    } catch (error) {
      if (stopped) break;
      logger.error('Telegram bot setup failed:', error.message);
      await delay(5000);
    }
  }

  while (!stopped) {
      try {
        const updates = await telegramCall(token, 'getUpdates', {
          offset, timeout: 25, allowed_updates: ['message']
        }, fetchImpl, AbortSignal.timeout(35000));
        for (const update of updates) {
          offset = Math.max(offset, Number(update.update_id) + 1);
          try {
            await replyToTelegramUpdate(update, { token, webAppUrl: appUrl, superAdminTelegramId, fetchImpl });
          } catch (error) {
            logger.error('Telegram message reply failed:', error.message);
          }
        }
      } catch (error) {
        if (stopped) break;
        if (error.name !== 'AbortError' && error.name !== 'TimeoutError') {
          logger.error('Telegram polling error:', error.message);
        }
        await delay(2500);
      }
    }
  };

  pollingTask = poll();
  return {
    stop: async () => {
      stopped = true;
      await pollingTask;
    }
  };
}

// Posts a plain-text update to the game's Telegram channel. The bot must be an administrator of the channel.
export async function sendChannelMessage(text, { token, chatId, fetchImpl = fetch }) {
  return telegramCall(token, 'sendMessage', {
    chat_id: chatId,
    text: String(text).slice(0, 4000),
    disable_web_page_preview: true
  }, fetchImpl, AbortSignal.timeout(15000));
}
