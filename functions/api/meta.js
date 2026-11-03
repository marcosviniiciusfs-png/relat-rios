import { json } from '../_lib/auth.mjs';
import { puxar } from '../_lib/meta.mjs';
import lista from '../_lib/clientes-ativos.json';

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const slug = u.searchParams.get('slug'), inicio = u.searchParams.get('inicio'), fim = u.searchParams.get('fim');
  const c = lista.clientes.find(x => x.slug === slug);
  if (!c) return json({ erro: 'Cliente desconhecido' }, 400);
  const d = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  if (!d(inicio) || !d(fim) || inicio > fim) return json({ erro: 'Datas inválidas' }, 400);
  if ((Date.parse(fim) - Date.parse(inicio)) / 864e5 > 62) return json({ erro: 'Período máximo: 62 dias' }, 400);
  try {
    return json({ slug, nome: c.nomeRelatorio, rows: await puxar({ token: env.META_PAGE_TOKEN, conta: c.conta, inicio, fim }) });
  } catch (e) { return json({ erro: e.message }, 502); }
}
