import test from 'node:test';
import assert from 'node:assert/strict';
import { replyToTelegramUpdate } from '../src/telegram-bot.js';

test('/start replies with a Telegram Mini App button in a private chat', async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
    return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 1 } }) };
  };
  const handled = await replyToTelegramUpdate({
    message: { text: '/start', chat: { id: 123, type: 'private' }, from: { id: 123 } }
  }, { token: 'test-token', webAppUrl: 'https://game.example.com/', fetchImpl });

  assert.equal(handled, true);
  assert.equal(request.url, 'https://api.telegram.org/bottest-token/sendMessage');
  assert.equal(request.body.chat_id, 123);
  assert.match(request.body.text, /Welcome to ZAMIN FK Management Game/);
  assert.equal(request.body.reply_markup.inline_keyboard[0][0].web_app.url, 'https://game.example.com/');
});

test('/start in a group does not expose a Web App button', async () => {
  let body;
  const fetchImpl = async (_url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => ({ ok: true, result: {} }) };
  };
  await replyToTelegramUpdate({
    message: { text: '/start', chat: { id: -123, type: 'group' }, from: { id: 123 } }
  }, { token: 'test-token', webAppUrl: 'https://game.example.com/', fetchImpl });
  assert.equal(body.reply_markup, undefined);
  assert.match(body.text, /private chat/);
});

test('unknown messages and bot messages are ignored', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; };
  const options = { token: 'test-token', webAppUrl: 'https://game.example.com/', fetchImpl };
  assert.equal(await replyToTelegramUpdate({ message: { text: 'hello', chat: { id: 1, type: 'private' } } }, options), false);
  assert.equal(await replyToTelegramUpdate({ message: { text: '/start', from: { is_bot: true }, chat: { id: 1, type: 'private' } } }, options), false);
  assert.equal(calls, 0);
});

test('rejects non-HTTPS Mini App URLs', async () => {
  await assert.rejects(
    replyToTelegramUpdate({ message: { text: '/start', chat: { id: 1, type: 'private' } } },
      { token: 'test-token', webAppUrl: 'http://game.example.com/', fetchImpl: async () => ({}) }),
    /HTTPS/
  );
});
