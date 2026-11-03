const enc = new TextEncoder();
async function hmac(secret, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, enc.encode(msg));
  return [...new Uint8Array(s)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function igual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const DIAS = 14;
export async function criarSessao(env) {
  const exp = Date.now() + DIAS * 864e5;
  return `${exp}.${await hmac(env.SESSION_SECRET, String(exp))}`;
}
export const cookieSessao = v => `sess=${v}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DIAS * 86400}`;
export async function sessaoValida(env, req) {
  const m = /(?:^|;\s*)sess=([^;]+)/.exec(req.headers.get('Cookie') || '');
  if (!m || !env.SESSION_SECRET) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return igual(sig, await hmac(env.SESSION_SECRET, exp));
}
export const json = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), { status, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, headers) });
