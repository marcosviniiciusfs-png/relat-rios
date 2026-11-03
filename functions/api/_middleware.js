import { sessaoValida, json } from '../_lib/auth.mjs';

export async function onRequest(ctx) {
  const path = new URL(ctx.request.url).pathname;
  if (path === '/api/login') return ctx.next();
  if (!(await sessaoValida(ctx.env, ctx.request))) return json({ erro: 'login' }, 401);
  return ctx.next();
}
