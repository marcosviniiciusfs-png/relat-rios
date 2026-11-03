/* Hurtz Relatório Semanal - núcleo de dados.
   Lê o export do Gerenciador de Anúncios, agrupa campanhas, calcula métricas e gera os textos.
   Roda no navegador (window.HurtzCore) e no Node (CLI). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HurtzCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const num = v => {
    if (v === '' || v == null) return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    let s = String(v).trim().replace(/[R$\s%]/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return isFinite(n) ? n : 0;
  };
  const nf = (v, d = 0) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const money = v => 'R$ ' + nf(v, 2);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  /* ---------- indicadores do Meta ---------- */
  const INDICADORES = [
    [/messaging_conversation_started|messaging_first_reply|total_messaging_connection|conversa/, { kind: 'conversa', label: 'conversas', singular: 'conversa', role: 'principal', tipo: 'MENSAGENS' }],
    [/lead/, { kind: 'lead', label: 'leads de formulário', singular: 'lead', role: 'principal', tipo: 'FORMULÁRIO' }],
    [/profile_visit/, { kind: 'visita_perfil', label: 'visitas ao perfil', singular: 'visita', role: 'outro' }],
    [/landing_page_view/, { kind: 'visita_pagina', label: 'visitas à página', singular: 'visita', role: 'outro' }],
    [/link_click/, { kind: 'clique_link', label: 'cliques no link', singular: 'clique', role: 'outro' }],
    [/thruplay|video_view|video/, { kind: 'video', label: 'visualizações de vídeo', singular: 'visualização', role: 'outro' }],
    [/engagement|post_reaction|like/, { kind: 'engajamento', label: 'engajamentos', singular: 'engajamento', role: 'outro' }],
    [/reach|impressions/, { kind: 'alcance', label: 'alcance', singular: 'pessoa', role: 'outro' }],
  ];
  function indicatorInfo(raw) {
    const s = norm(raw);
    if (!s) return { kind: '', label: '', role: 'principal' };
    for (const [re, info] of INDICADORES) if (re.test(s)) return info;
    return { kind: 'outro:' + s, label: s.replace(/^actions:/, '').replace(/[_.]/g, ' '), singular: 'resultado', role: 'outro' };
  }

  const DEFAULT_KEYWORDS = [
    'REMARKETING|remarketing',
    'IMÓVEL|imovel|imoveis',
    'VEÍCULO|veiculo|carro|auto',
    'CAMINHÃO|caminhao',
    'MAQUINÁRIO|maquinario',
    'VAGA|vaga',
    'APARELHO|aparelho',
    'IMPLANTE|implante',
  ];

  /* ---------- leitura das linhas ---------- */
  const COLS = {
    start: ['inicio dos relatorios'], end: ['encerramento dos relatorios'],
    name: ['nome da campanha', 'campanha'], adset: ['nome do conjunto de anuncios'], ad: ['nome do anuncio'],
    status: ['veiculacao da campanha', 'veiculacao do conjunto de anuncios', 'veiculacao do anuncio', 'veiculacao'],
    results: ['resultados'], indicator: ['indicador de resultados'], cost: ['custo por resultados'],
    spend: ['valor gasto (brl)', 'valor usado (brl)', 'valor gasto'],
    impressions: ['impressoes'], reach: ['alcance'], linkClicks: ['cliques no link'],
  };
  function mapHeaders(headers) {
    const out = {};
    const normed = headers.map(norm);
    for (const [key, names] of Object.entries(COLS)) {
      for (const n of names) {
        const i = normed.indexOf(n);
        if (i >= 0) { out[key] = headers[i]; break; }
      }
    }
    return out;
  }

  /* jsonRows: array de objetos (sheet_to_json). Retorna {rows, start, end, level} */
  function parseRows(jsonRows) {
    if (!jsonRows.length) return { rows: [], start: '', end: '', level: 'campanha' };
    const h = mapHeaders(Object.keys(jsonRows[0]));
    if (!h.name) h.name = h.adset || h.ad; // export por conjunto ou anúncio: usa o nome disponível
    if (!h.name || !h.spend) throw new Error('Planilha sem colunas "Nome da campanha" e "Valor gasto". É o export do Gerenciador de Anúncios?');
    const rows = [];
    let start = '', end = '';
    for (const r of jsonRows) {
      const name = String(r[h.name] || '').trim();
      if (!name) continue;
      const spend = num(r[h.spend]);
      const results = num(r[h.results]);
      if (!spend && !results) continue;
      const info = indicatorInfo(r[h.indicator]);
      const s = String(r[h.start] || ''), e = String(r[h.end] || '');
      if (s && (!start || s < start)) start = s;
      if (e && (!end || e > end)) end = e;
      const adset = h.adset ? String(r[h.adset] || '').trim() : '';
      const ad = h.ad ? String(r[h.ad] || '').trim() : '';
      rows.push({
        name, adset, ad,
        label: ad || adset || name,
        status: String(r[h.status] || ''),
        indicator: String(r[h.indicator] || ''),
        kind: info.kind,
        results, spend,
        impressions: num(r[h.impressions]), reach: num(r[h.reach]), linkClicks: num(r[h.linkClicks]),
      });
    }
    // linhas sem indicador (sem resultado) herdam o tipo dominante do cliente
    const byKind = {};
    rows.forEach(r => { if (r.kind && r.results) byKind[r.kind] = (byKind[r.kind] || 0) + r.results; });
    const dom = Object.entries(byKind).filter(([k]) => indicatorByKind(k).role === 'principal').sort((a, b) => b[1] - a[1])[0];
    rows.forEach(r => { if (!r.kind) r.kind = dom ? dom[0] : 'conversa'; });
    return { rows, start, end, level: h.ad ? 'anuncio' : h.adset ? 'conjunto' : 'campanha' };
  }
  function indicatorByKind(kind) {
    for (const [, info] of INDICADORES) if (info.kind === kind) return info;
    return { kind, label: kind.replace(/^outro:/, ''), singular: 'resultado', role: 'outro' };
  }

  /* ---------- datas ---------- */
  function periodoTexto(start, end) {
    const p = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; };
    const a = p(start), b = p(end);
    if (!a) return '';
    if (!b || (a.y === b.y && a.m === b.m && a.d === b.d)) return `${a.d} de ${MESES[a.m - 1]} de ${a.y}`;
    if (a.y === b.y && a.m === b.m) return `${a.d} a ${b.d} de ${MESES[a.m - 1]} de ${a.y}`;
    if (a.y === b.y) return `${String(a.d).padStart(2, '0')}/${String(a.m).padStart(2, '0')} a ${String(b.d).padStart(2, '0')}/${String(b.m).padStart(2, '0')}/${b.y}`;
    return `${a.d}/${a.m}/${a.y} a ${b.d}/${b.m}/${b.y}`;
  }

  /* ---------- nome do cliente a partir do arquivo ---------- */
  function nomeDoArquivo(fileName) {
    let s = fileName.replace(/\.[^.]+$/, '').replace(/\s*\(\d+\)\s*$/, '');
    s = s.replace(/-?Campanhas?-.*$/i, '').replace(/-?Conjuntos?-.*$/i, '').replace(/-?An[uú]ncios?-.*$/i, '');
    s = s.replace(/--+/g, ' - ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    s = s.replace(/^(CA) (?=\S)/i, 'CA - ');
    return s.toUpperCase();
  }
  const titleCase = s => s.toLowerCase().replace(/(^|\s|\.)([a-zà-ú])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Dos|Das|E)\b/g, x => x.toLowerCase());
  function nomeTextoDe(nome) { return titleCase(nome.replace(/^CA\s*-\s*/i, '').replace(/^CONTA\s+/i, 'conta ')).replace(/^(Dra?)\s/, '$1. '); }
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------- agrupamento ---------- */
  function guessGroup(name, keywords) {
    const n = norm(name);
    for (const k of keywords || DEFAULT_KEYWORDS) {
      const [label, ...alts] = k.split('|');
      if ([label, ...alts].some(a => a && n.includes(norm(a)))) return label.toUpperCase();
    }
    let s = name
      .replace(/\b\d{1,2}[\/.-]\d{1,2}([\/.-]\d{2,4})?\b/g, '')
      .replace(/[-–—|]?\s*c[óo]pia( \d+)?/gi, '')
      .replace(/^\s*\d+\s*[-–.]\s*/, '')
      .replace(/otimiza[cç][aã]o|otomodela[cç][aã]o/gi, '')
      .replace(/[-–—]+/g, ' ').replace(/\s+/g, ' ').trim();
    return (s || name).toUpperCase();
  }

  const defaultCfg = () => ({
    nome: '', nomeTexto: '', periodo: '', campanhasTxt: '',
    groups: {}, keywords: DEFAULT_KEYWORDS.slice(), roles: {},
    mostrarTipo: 'auto', fourth: 'auto', unit: 'auto',
  });

  /* ---------- modelo do relatório ---------- */
  function buildModel(parsed, cfg, att) {
    cfg = Object.assign(defaultCfg(), cfg || {});
    const roleOf = kind => cfg.roles[kind] || indicatorByKind(kind).role;
    const rows = parsed.rows.map(r => {
      const key = r.name;
      const grupo = (cfg.groups[key] || guessGroup(r.name, cfg.keywords)).toUpperCase();
      return Object.assign({}, r, { grupo, role: roleOf(r.kind) });
    });
    const used = rows.filter(r => r.role !== 'ignorar');
    const prin = used.filter(r => r.role === 'principal');
    const outr = used.filter(r => r.role === 'outro');

    const kindsPrin = [...new Set(prin.filter(r => r.results).map(r => r.kind))];
    const hasConversa = kindsPrin.includes('conversa'), hasLead = kindsPrin.includes('lead');
    const onlyOne = kindsPrin.length === 1 ? kindsPrin[0] : null;
    let unit;
    if (cfg.unit && cfg.unit !== 'auto') {
      unit = { plural: cfg.unit, singular: cfg.unit.replace(/s$/, '') };
    } else if (onlyOne) {
      const i = indicatorByKind(onlyOne);
      unit = { plural: onlyOne === 'lead' ? 'leads' : i.label, singular: i.singular };
    } else unit = { plural: 'resultados', singular: 'resultado' };
    unit.rotulo = unit.plural.toUpperCase();
    unit.cardSub = onlyOne === 'conversa' ? 'CONVERSAS INICIADAS' : onlyOne === 'lead' ? 'LEADS DE FORMULÁRIO' : kindsPrin.length > 1 ? 'LEADS + CONVERSAS' : 'RESULTADOS';
    unit.custoSub = 'POR ' + unit.singular.toUpperCase();

    const sum = (arr, k) => arr.reduce((s, r) => s + r[k], 0);
    const results = sum(prin, 'results');
    const spendPrin = sum(prin, 'spend');
    const spendAll = sum(used, 'spend');
    const cost = results ? spendPrin / results : 0;

    // grupos
    const mostrarTipo = cfg.mostrarTipo === 'sim' || (cfg.mostrarTipo === 'auto' && hasConversa && hasLead);
    const gmap = new Map();
    prin.forEach(r => {
      const tipo = indicatorByKind(r.kind).tipo || '';
      const key = r.grupo + (mostrarTipo ? '|' + tipo : '');
      if (!gmap.has(key)) gmap.set(key, { label: r.grupo, sub: mostrarTipo ? tipo : '', results: 0, spend: 0, itens: 0 });
      const g = gmap.get(key);
      g.results += r.results; g.spend += r.spend; g.itens++;
    });
    const groups = [...gmap.values()].map(g => Object.assign(g, { cost: g.results ? g.spend / g.results : 0 }));
    groups.sort((a, b) => b.results - a.results || b.spend - a.spend);

    // outros resultados
    const okind = new Map();
    outr.forEach(r => {
      if (!okind.has(r.kind)) okind.set(r.kind, { kind: r.kind, info: indicatorByKind(r.kind), results: 0, spend: 0 });
      const o = okind.get(r.kind); o.results += r.results; o.spend += r.spend;
    });
    const outros = [...okind.values()].filter(o => o.results).sort((a, b) => b.results - a.results);
    const impressions = sum(used, 'impressions'), reach = sum(used, 'reach');

    const zero = prin.filter(r => !r.results && r.spend > 0);
    const itensOrd = prin.filter(r => r.results).map(r => Object.assign({}, r, { cost: r.spend / r.results })).sort((a, b) => a.cost - b.cost);

    const campanhas = [...new Set(groups.map(g => g.label))];
    const OUT_LABEL = { visita_perfil: 'RECONHECIMENTO', clique_link: 'TRÁFEGO', visita_pagina: 'TRÁFEGO', video: 'VÍDEO', engajamento: 'ENGAJAMENTO' };
    const outroLabels = [...new Set(outr.filter(r => r.results || r.spend).map(r => OUT_LABEL[r.kind] || r.grupo))].filter(g => !campanhas.includes(g));

    const m = {
      nome: cfg.nome, nomeTexto: cfg.nomeTexto || nomeTextoDe(cfg.nome || ''),
      periodo: cfg.periodo || periodoTexto(parsed.start, parsed.end),
      campanhas: cfg.campanhasTxt ? cfg.campanhasTxt.split(/\s*[•,]\s*/).filter(Boolean) : campanhas.concat(outroLabels),
      unit, hasConversa, hasLead, mostrarTipo,
      totals: { results, spendPrin, spendAll, cost, impressions, reach, leads: sum(prin.filter(r => r.kind === 'lead'), 'results'), conversas: sum(prin.filter(r => r.kind === 'conversa'), 'results') },
      groups, outros, zero, itensOrd,
      att: att && att.rows && att.rows.length ? att : null,
    };
    let fourth = cfg.fourth;
    if (fourth === 'auto') fourth = m.att ? 'atendimento' : outros.length ? 'outros' : 'total';
    if (fourth === 'atendimento' && !m.att) fourth = outros.length ? 'outros' : 'total';
    if (fourth === 'outros' && !outros.length) fourth = 'total';
    m.fourth = fourth;
    return m;
  }

  /* ---------- atendimento (colado do Excel/Sheets ou CSV) ---------- */
  function parseAtendimento(text) {
    const lines = String(text || '').split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return null;
    const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
    let grid = lines.map(l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, '')));
    const looksDate = c => /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(c);
    // dias nas linhas -> transpõe
    if (grid.slice(1).every(r => looksDate(r[0])) && !grid[0].slice(1).every(looksDate)) {
      const w = Math.max(...grid.map(r => r.length));
      grid = Array.from({ length: w }, (_, c) => grid.map(r => r[c] || ''));
    }
    let head = grid[0].slice(1);
    let body = grid.slice(1).filter(r => r[0]);
    const ti = head.findIndex(h => norm(h) === 'total');
    if (ti >= 0) { head = head.filter((_, i) => i !== ti); body = body.map(r => r.filter((_, i) => i !== ti + 1)); }
    const days = head.map(d => d.replace(/^(\d{1,2})\/(\d{1,2})\/\d{2,4}$/, '$1/$2'));
    const rows = body.map(r => {
      const values = days.map((_, i) => num(r[i + 1]));
      return { label: r[0], values, total: values.reduce((a, b) => a + b, 0) };
    });
    let periodo = '';
    if (days.length) {
      const f = days[0], l = days[days.length - 1];
      const [fd, fm] = f.split('/'), [ld, lm] = l.split('/');
      periodo = days.length === 1 ? f : fm === lm ? `${fd} a ${ld}/${lm}` : `${f} a ${l}`;
    }
    return { days, rows, periodo };
  }

  /* ---------- textos ---------- */
  function gerarTextos(m) {
    const t = m.totals, u = m.unit, n0 = x => nf(x);
    const nomeT = m.nomeTexto;
    let resumo;
    if (!t.results) resumo = `${nomeT} investiu ${money(t.spendAll)} no período, sem resultados registrados.`;
    else if (u.plural === 'resultados' && t.leads && t.conversas) {
      resumo = `${nomeT} somou ${n0(t.results)} resultados: ${n0(t.leads)} leads de formulário e ${n0(t.conversas)} conversas, com investimento de ${money(t.spendPrin)} e custo de ${money(t.cost)}.`;
    } else {
      resumo = `${nomeT} gerou ${n0(t.results)} ${u.plural} com investimento de ${money(t.spendPrin)}. O custo médio ficou em ${money(t.cost)} por ${u.singular}.`;
    }
    if (m.outros.length) {
      const o = m.outros[0];
      resumo += ` ${cap(o.info.label)}: ${n0(o.results)}.`;
    }
    if (m.att) {
      const r = m.att.rows;
      resumo += ` Atendimento (${m.att.periodo}): ${r.slice(0, 2).map(x => `${n0(x.total)} ${x.label.toLowerCase()}`).join(' e ')}.`;
    }

    let bom = '';
    const cand = m.groups.filter(g => g.results >= Math.max(3, t.results * 0.08));
    const melhor = (cand.length ? cand : m.groups).slice().sort((a, b) => a.cost - b.cost)[0];
    if (melhor && m.groups.length > 1) {
      bom = `${titleCase(melhor.label)} gerou ${n0(melhor.results)} ${u.plural} a ${money(melhor.cost)} cada${melhor.cost < t.cost ? `, abaixo do custo médio de ${money(t.cost)}` : ''}.`;
    } else if (melhor) {
      bom = `${titleCase(melhor.label)} concentrou os ${n0(melhor.results)} ${u.plural} a ${money(melhor.cost)} cada.`;
    }
    const itens = m.itensOrd.filter(i => i.results >= Math.max(3, t.results * 0.08));
    if (itens.length > 1 && melhor && (itens[0].results !== melhor.results || Math.abs(itens[0].cost - melhor.cost) > 0.005)) {
      const b = itens[0];
      bom += ` A melhor variação gerou ${n0(b.results)} ${u.plural} a ${money(b.cost)} cada.`;
    }
    if (m.att && m.att.ratio) bom += ` ${m.att.ratio.label}: ${m.att.ratio.texto}.`;
    if (!bom) bom = 'Operação ativa no período, com campanhas rodando.';

    let melhorar;
    if (m.zero.length) {
      const gasto = m.zero.reduce((s, r) => s + r.spend, 0);
      melhorar = `Revisar ${m.zero.length === 1 ? 'a variação sem resultado registrado' : `as ${m.zero.length} variações sem resultados registrados`} (${money(gasto)}) e avaliar a redistribuição da verba conforme o custo por ${u.singular}.`;
    } else {
      const pior = m.groups.filter(g => g.results).slice().sort((a, b) => b.cost - a.cost)[0];
      if (pior && m.groups.length > 1 && pior.cost > t.cost * 1.25) {
        melhorar = `Revisar ${titleCase(pior.label)}, com ${n0(pior.results)} ${u.plural} a ${money(pior.cost)} cada, acima da média de ${money(t.cost)}. Testar novos criativos antes de ampliar a verba.`;
      } else {
        const p = m.itensOrd[m.itensOrd.length - 1];
        melhorar = p && m.itensOrd.length > 1 && p.cost > t.cost * 1.25
          ? `Revisar a variação mais cara (${money(p.cost)} por ${u.singular}) e avaliar a redistribuição da verba para as opções de menor custo.`
          : `Testar novas variações de criativo para comparar custo e qualidade dos ${u.plural}.`;
      }
    }
    if (m.att) melhorar += ' Registrar a origem de cada atendimento para ligar anúncio a agendamento.';

    const notas = [];
    if (m.outros.length) notas.push(`${cap(m.outros[0].info.label)} e ${u.plural} são métricas distintas e não são somadas.`);
    if (m.att) notas.push(`Atendimento: ${m.att.periodo}. Dados sem vínculo individual com as conversas dos anúncios.`);
    let notaTabela = '';
    if (t.results) {
      if (u.plural === 'resultados' && t.leads && t.conversas) notaTabela = `${n0(t.leads)} leads de formulário e ${n0(t.conversas)} conversas iniciadas.`;
      else if (u.plural === 'leads') notaTabela = `${n0(t.results)} leads captados por formulário no período.`;
      else if (u.plural === 'conversas') notaTabela = `${n0(t.results)} conversas iniciadas no período.`;
    }
    return { resumo, bom, melhorar, nota: notas.join(' '), notaTabela };
  }

  /* ---------- atendimento: derivados ---------- */
  function prepararAtendimento(att, layout) {
    if (!att) return null;
    layout = layout || {};
    const rows = att.rows.map((r, i) => Object.assign({}, r, {
      card: layout.card ? layout.card.includes(i) : i < 3,
      tabela: layout.tabela ? layout.tabela.includes(i) : true,
    }));
    let ratio = null;
    if (layout.ratio && layout.ratio.num >= 0 && layout.ratio.den >= 0 && rows[layout.ratio.num] && rows[layout.ratio.den] && rows[layout.ratio.den].total) {
      const v = rows[layout.ratio.num].total / rows[layout.ratio.den].total * 100;
      ratio = { valor: nf(v, 1) + '%', texto: nf(v, 1) + '%', label: layout.ratio.label || `${rows[layout.ratio.num].label} / ${rows[layout.ratio.den].label}` };
    }
    return { days: att.days, rows, periodo: layout.periodo || att.periodo, ratio };
  }

  return { norm, num, nf, money, esc, slug, titleCase, parseRows, buildModel, defaultCfg, guessGroup, periodoTexto, nomeDoArquivo, nomeTextoDe, parseAtendimento, prepararAtendimento, gerarTextos, indicatorByKind, DEFAULT_KEYWORDS };
});
