import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
export function sign(value, secret) {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
export function verify(token, secret, purpose, now = Date.now()) {
  if (!token || typeof token !== 'string') return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  const expected = createHmac('sha256', secret).update(payload).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try { const value = JSON.parse(Buffer.from(payload, 'base64url').toString()); return value.purpose === purpose && value.exp > now ? value : null; } catch { return null; }
}
export function cookies(request) {
  return Object.fromEntries((request.headers.get('cookie') || '').split(';').map(item => item.trim().split(/=(.*)/s).slice(0, 2)).filter(pair => pair.length === 2));
}
export function cookie(name, value, seconds, request) {
  const secure = new URL(request.url).protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure ? '; Secure' : ''}`;
}
export function nonce() { return randomBytes(24).toString('base64url'); }
