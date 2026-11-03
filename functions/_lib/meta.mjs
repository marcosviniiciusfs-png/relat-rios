/* Busca insights por campanha na Meta e devolve linhas no mesmo formato do export do Gerenciador de Anúncios. */
const API = 'https://graph.facebook.com/v21.0';

const num = v => Number(v || 0);

const CONV = 'onsite_conversion.messaging_conversation_started_7d';
function resultado(d) {
  const r = (d.results || [])[0];
  if (r && r.values && r.values[0]) {
    // campanha de mensagens otimizada para engajamento/cliques: o que importa são as conversas iniciadas
    const conv = num((d.actions || []).find(x => x.action_type === CONV)?.value);
    if (conv && /post_engagement|link_click|landing_page_view/.test(r.indicator) && /mensag|whats|wpp|zap|conversa/i.test(d.campaign_name || '')) {
      return { indicador: 'actions:' + CONV, valor: conv };
    }
    return { indicador: r.indicator, valor: num(r.values[0].value) };
  }
  // campanhas de formulário instantâneo não trazem "results": usa as ações
  const a = t => num((d.actions || []).find(x => x.action_type === t)?.value);
  const lead = a('lead');
  if (lead) return { indicador: 'actions:leadgen.other', valor: lead };
  const conv = a('onsite_conversion.messaging_conversation_started_7d');
  if (conv) return { indicador: 'actions:onsite_conversion.messaging_conversation_started_7d', valor: conv };
  return { indicador: '', valor: 0 };
}

export async function puxar({ token, conta, inicio, fim }) {
  const params = new URLSearchParams({
    level: 'campaign',
    time_range: JSON.stringify({ since: inicio, until: fim }),
    fields: 'campaign_name,spend,impressions,reach,results,actions',
    limit: '500',
    access_token: token,
  });
  let url = `${API}/${conta}/insights?${params}`;
  const rows = [];
  while (url) {
    const r = await fetch(url);
    const j = await r.json();
    if (j.error) throw new Error(`Meta (${conta}): ${j.error.message}`);
    for (const d of j.data || []) {
      const spend = num(d.spend);
      const res = resultado(d);
      if (!spend && !res.valor) continue;
      rows.push({
        'Início dos relatórios': inicio,
        'Encerramento dos relatórios': fim,
        'Nome da campanha': d.campaign_name,
        'Veiculação da campanha': '',
        'Resultados': res.valor || '',
        'Indicador de resultados': res.indicador,
        'Custo por resultados': res.valor ? spend / res.valor : '',
        'Valor gasto (BRL)': spend,
        'Impressões': num(d.impressions),
        'Alcance': num(d.reach),
      });
    }
    url = j.paging && j.paging.next ? j.paging.next : null;
  }
  return rows;
}
