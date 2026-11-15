import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { config } from '../src/config.js';
import { verifyTelegramWidget } from '../src/auth.js';

function signed(fields, token) {
  const check = Object.entries(fields).map(([k, v]) => k + '=' + v).sort().join('\n');
  const secret = crypto.createHash('sha256').update(token).digest();
  return crypto.createHmac('sha256', secret).update(check).digest('hex');
}

test('Telegram Login Widget data is accepted only with a valid signature', () => {
  config.telegramBotToken = '123:test-token';
  const fields = { id: '42', first_name: 'Ali', username: 'ali', auth_date: String(Math.floor(Date.now() / 1000)) };
  const data = { ...fields, hash: signed(fields, config.telegramBotToken) };
  assert.equal(verifyTelegramWidget(data).id, '42');
  assert.throws(() => verifyTelegramWidget({ ...data, first_name: 'Eve' }), /signature/);
  assert.throws(() => verifyTelegramWidget({ ...data, hash: '0'.repeat(64) }), /signature/);
  const old = { id: '42', auth_date: String(Math.floor(Date.now() / 1000) - 10 * 86400) };
  assert.throws(() => verifyTelegramWidget({ ...old, hash: signed(old, config.telegramBotToken) }), /expired/);
});
