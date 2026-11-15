import {config} from './config.js';
import {sendChannelMessage} from './telegram-bot.js';

// Sends one update to the Telegram channel. Does nothing when the bot token or channel is not configured.
// Failures are logged only: a game action never waits for, or fails because of, Telegram.
export function announce(text,{logger=console}={}){
 if(!config.telegramBotToken||!config.telegramChannelId||!text)return;
 sendChannelMessage(text,{token:config.telegramBotToken,chatId:config.telegramChannelId}).catch(error=>logger.error('Channel update failed:',error.message));
}
