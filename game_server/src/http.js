export class HttpError extends Error {
 constructor(status, message) { super(message); this.status = status; }
}
export function json(res, status, data) {
 const body = JSON.stringify(data);
 res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body),
  'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
 res.end(body);
}
export async function readJson(req, limit = 65536) {
 const chunks = []; let size = 0;
 for await (const chunk of req) { size += chunk.length; if (size > limit) throw new HttpError(413, 'Request body too large'); chunks.push(chunk); }
 if (!chunks.length) return {};
 try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'Invalid JSON body'); }
}
export function safeString(value, max, label) {
 if (typeof value !== 'string') throw new HttpError(400, label + ' is required');
 const text = value.trim(); if (!text || text.length > max) throw new HttpError(400, label + ' is invalid'); return text;
}
export function colour(value, label) {
 if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) throw new HttpError(400, label + ' must be a six-digit hex colour');
 return value.toUpperCase();
}
export function uuid(value, label = 'ID') {
 if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new HttpError(400, label + ' is invalid');
 return value;
}
