import crypto from 'node:crypto';
import { config } from './config.js';
import { HttpError } from './http.js';
import { requireDb } from './db.js';
function safeEqualHex(a,b) {
 if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b) || a.length !== b.length) return false;
 return crypto.timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
export function verifyTelegramInitData(initData) {
 if (!config.telegramBotToken) throw new HttpError(503,'Telegram authentication is not configured');
 if (typeof initData !== 'string' || initData.length > 8192) throw new HttpError(400,'Telegram initData is missing or too large');
 const params = new URLSearchParams(initData), receivedHash = params.get('hash');
 if (!receivedHash) throw new HttpError(401,'Telegram signature is missing');
 params.delete('hash');
 const pairs = [...params.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => k + '=' + v);
 const secretKey = crypto.createHmac('sha256','WebAppData').update(config.telegramBotToken).digest();
 const expected = crypto.createHmac('sha256',secretKey).update(pairs.join('\n')).digest('hex');
 if (!safeEqualHex(receivedHash,expected)) throw new HttpError(401,'Telegram signature is invalid');
 const authDate = Number(params.get('auth_date')), now = Math.floor(Date.now()/1000);
 if (!Number.isFinite(authDate) || authDate > now + 30 || now - authDate > config.telegramAuthMaxAgeSeconds) throw new HttpError(401,'Telegram authentication data has expired');
 let user; try { user = JSON.parse(params.get('user') || 'null'); } catch { throw new HttpError(401,'Telegram user data is invalid'); }
 if (!user || !Number.isSafeInteger(user.id)) throw new HttpError(401,'Telegram user is missing');
 return user;
}
function signToken(payload) {
 if (!config.sessionSecret || config.sessionSecret.length < 24) throw new HttpError(503,'SESSION_SECRET must contain at least 24 characters');
 const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
 const signature = crypto.createHmac('sha256',config.sessionSecret).update(encoded).digest('base64url');
 return encoded + '.' + signature;
}
function verifyToken(token) {
 if (!config.sessionSecret || typeof token !== 'string') throw new HttpError(401,'Authentication required');
 const parts = token.split('.'), encoded = parts[0], signature = parts[1];
 if (!encoded || !signature) throw new HttpError(401,'Invalid session');
 const expected = crypto.createHmac('sha256',config.sessionSecret).update(encoded).digest('base64url');
 const a = Buffer.from(signature), b = Buffer.from(expected);
 if (a.length !== b.length || !crypto.timingSafeEqual(a,b)) throw new HttpError(401,'Invalid session');
 let payload; try { payload = JSON.parse(Buffer.from(encoded,'base64url').toString('utf8')); } catch { throw new HttpError(401,'Invalid session'); }
 if (!payload.sub || payload.exp < Math.floor(Date.now()/1000)) throw new HttpError(401,'Session expired');
 return payload;
}
export async function authenticate(req) {
 const header = req.headers.authorization || '';
 if (header.startsWith('Bearer ')) { const p = verifyToken(header.slice(7)); return { id:p.sub, telegramUserId:p.tg }; }
 if (config.nodeEnv === 'development' && config.allowDevAuth) {
  const devId = req.headers['x-dev-user-id'];
  if (typeof devId === 'string' && /^[1-9][0-9]{0,18}$/.test(devId)) {
   const db = requireDb();
   const r = await db.query('INSERT INTO game_users(telegram_user_id,username,first_name) VALUES($1,$2,$3) ON CONFLICT(telegram_user_id) DO UPDATE SET last_seen_at=NOW() RETURNING id,telegram_user_id',
    ['dev-' + devId,'local_dev','Local Developer']);
   return { id:r.rows[0].id, telegramUserId:r.rows[0].telegram_user_id };
  }
 }
 throw new HttpError(401,'Authentication required');
}
export async function telegramLogin(initData) {
 const user = verifyTelegramInitData(initData), db = requireDb();
 const r = await db.query('INSERT INTO game_users(telegram_user_id,username,first_name,last_name,last_seen_at) VALUES($1,$2,$3,$4,NOW()) ON CONFLICT(telegram_user_id) DO UPDATE SET username=EXCLUDED.username,first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,last_seen_at=NOW() RETURNING id,telegram_user_id,username,first_name',
  [String(user.id),user.username || null,user.first_name || null,user.last_name || null]);
 const account = r.rows[0], token = signToken({sub:account.id,tg:account.telegram_user_id,exp:Math.floor(Date.now()/1000)+config.sessionMaxAgeSeconds});
 return { token, user:{id:account.id,username:account.username,firstName:account.first_name} };
}
