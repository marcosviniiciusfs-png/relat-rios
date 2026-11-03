import { criarSessao, cookieSessao, igual, json } from '../_lib/auth.mjs';

export async function onRequestPost({ request, env }) {
  let body = {};
  try { body = await request.json(); } catch { }
  const ok = env.APP_PASSWORD && typeof body.senha === 'string' && igual(body.senha, env.APP_PASSWORD);
  if (!ok) { await new Promise(r => setTimeout(r, 800)); return json({ erro: 'Senha incorreta' }, 401); }
  return json({ ok: true }, 200, { 'Set-Cookie': cookieSessao(await criarSessao(env)) });
}
