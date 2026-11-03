import { json } from '../_lib/auth.mjs';
import lista from '../_lib/clientes-ativos.json';

export function onRequestGet() {
  return json(lista.clientes.map(c => ({ slug: c.slug, nome: c.nomeRelatorio, atendimento: !!c.atendimento })));
}
