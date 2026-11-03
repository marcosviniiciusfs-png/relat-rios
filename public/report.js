/* Hurtz Relatório Semanal - desenho do relatório (1920x1080). Depende de HurtzCore. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.HurtzReport = factory(root.HurtzCore);
})(typeof self !== 'undefined' ? self : this, function (C) {
  const { esc, nf, money } = C;
  const R = '#ff3218', N = '#0e1c59';

  const ICON = {
    pessoas: `<svg viewBox="0 0 80 80"><g fill="${R}"><circle cx="40" cy="24" r="10"/><circle cx="19" cy="31" r="8"/><circle cx="61" cy="31" r="8"/><path d="M22 62c0-12 8-21 18-21s18 9 18 21z"/><path d="M5 60c0-9 6-16 14-16 2 0 4 .4 5 1-5 4-8 9-9 15z"/><path d="M75 60c0-9-6-16-14-16-2 0-4 .4-5 1 5 4 8 9 9 15z"/></g></svg>`,
    alvo: `<svg viewBox="0 0 80 80" fill="none" stroke="${R}" stroke-width="3.6" stroke-linecap="round"><circle cx="40" cy="40" r="22"/><circle cx="40" cy="40" r="11"/><circle cx="40" cy="40" r="3" fill="${R}"/><path d="M40 4v14M40 62v14M4 40h14M62 40h14"/></svg>`,
    real: `<svg viewBox="0 0 80 80" fill="none"><circle cx="40" cy="40" r="32" stroke="${R}" stroke-width="4"/><text x="40" y="52" text-anchor="middle" font-family="Inter,sans-serif" font-weight="800" font-size="34" fill="${R}">R$</text></svg>`,
    camadas: `<svg viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"><path d="M24 6l16 8-16 8-16-8z"/><path d="M8 22l16 8 16-8"/><path d="M8 30l16 8 16-8"/></svg>`,
    doc: `<svg viewBox="0 0 56 56" fill="none" stroke="${N}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="12" y="6" width="32" height="44" rx="4"/><path d="M20 4h16v6H20zM20 22h16M20 30h16M20 38h16"/></svg>`,
    check: `<svg viewBox="0 0 56 56" fill="none" stroke="${N}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="8" width="36" height="44" rx="4"/><path d="M20 5h16v7H20z"/><path d="M19 31l7 7 12-14"/></svg>`,
    trend: `<svg viewBox="0 0 56 56" fill="none" stroke="${N}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M8 8v40h40"/><path d="M14 38l10-10 8 6 14-16"/><path d="M38 18h8v8"/></svg>`,
    cal: `<svg viewBox="0 0 44 48" fill="none" stroke="${R}" stroke-width="3.2" stroke-linecap="round"><rect x="3" y="9" width="38" height="35" rx="5"/><path d="M3 20h38M13 3v10M31 3v10"/></svg>`,
  };

  function card(icon, label, sub, value) {
    return `<div class="card"><div class="ico">${ICON[icon]}</div><div class="clabel" data-fitw>${esc(label)}</div><div class="csub">${esc(sub)}</div><div class="rule"></div><div class="big" data-fitw>${esc(value)}</div><div class="bars"><i></i><i></i><i></i></div></div>`;
  }

  function fourthCard(m) {
    const u = m.unit, t = m.totals;
    if (m.fourth === 'total') {
      return `<div class="card c4 total"><div class="t">Total confirmado</div><div style="width:100%"><div class="v" data-fitw>${nf(t.results)}</div><div class="u">${esc(u.plural === 'resultados' ? 'resultados' : 'resultados')}</div></div><div class="rule"></div><p>Investimento total de ${money(t.spendAll)} no período analisado.</p></div>`;
    }
    let stats = [];
    let title = 'Outros resultados', tsub = '';
    if (m.fourth === 'atendimento') {
      title = 'Atendimento'; tsub = m.att.periodo;
      const cardRows = m.att.rows.filter(r => r.card);
      cardRows.forEach(r => stats.push({ v: nf(r.total), l: r.label }));
      if (m.att.ratio) stats.push({ v: m.att.ratio.valor, l: m.att.ratio.label, reg: true });
      stats = stats.slice(0, 4);
    } else {
      m.outros.slice(0, 2).forEach(o => stats.push({ v: nf(o.results), l: o.info.label }));
      if (m.outros[0] && m.outros[0].spend && stats.length < 3 && m.outros[0].results) stats.push({ v: money(m.outros[0].spend / m.outros[0].results), l: 'custo por ' + m.outros[0].info.singular });
      if (stats.length < 3 && m.totals.impressions) stats.push({ v: nf(m.totals.impressions), l: 'impressões' });
      if (stats.length < 3 && m.totals.reach) stats.push({ v: nf(m.totals.reach), l: 'alcance' });
      stats = stats.slice(0, 3);
    }
    const small = stats.length > 3;
    return `<div class="card c4"><div><div class="t">${esc(title)}</div>${tsub ? `<div class="tsub">${esc(tsub)}</div>` : ''}</div>${stats.map(s => `<div class="stat"><div class="v" data-fitw${small ? ' style="font-size:42px"' : ''}>${esc(s.v)}</div><div class="l${s.reg ? ' reg' : ''}">${esc(s.l)}</div></div>`).join('')}</div>`;
  }

  function panel(m, texts) {
    const u = m.unit;
    const att = m.fourth === 'atendimento' ? m.att : (m.att || null);
    const showDaily = m.fourth === 'atendimento' && m.att && m.att.days.length;
    const dailyRows = showDaily ? m.att.rows.filter(r => r.tabela !== false) : [];
    // muitas linhas ficam ilegíveis: agrupa as menores em "OUTROS"
    const maxLinhas = showDaily ? 4 : 6;
    let grupos = m.groups;
    if (grupos.length > maxLinhas) {
      const topo = grupos.slice(0, maxLinhas - 1), resto = grupos.slice(maxLinhas - 1);
      const res = resto.reduce((a, g) => a + g.results, 0), gas = resto.reduce((a, g) => a + g.spend, 0);
      grupos = topo.concat([{ label: `OUTROS (${resto.length})`, sub: '', results: res, spend: gas, cost: res ? gas / res : 0 }]);
    }
    const n = Math.max(grupos.length, 1);
    const dailyH = showDaily ? 34 + 24 * (dailyRows.length + 1) : 0;
    const base = showDaily ? 405 - 58 - 38 - dailyH : 405 - 76 - 46;
    let nota = texts.notaTabela;
    const gap = showDaily ? 4 : 6;
    let rh = Math.floor((base - (nota ? 40 : 0)) / n) - gap;
    if (rh < 34 && nota) { nota = ''; rh = Math.floor(base / n) - gap; }
    rh = Math.max(30, Math.min(64, rh));
    const nf1 = Math.max(16, Math.min(22, Math.round(rh * 0.42))), vf = Math.max(16, Math.min(27, Math.round(rh * 0.43)));
    const rows = grupos.map(g => `<div class="row"><div><span class="n">${esc(C.titleCase(g.label).replace(/\b(Ca|Mb)\b/g, x => x.toUpperCase()))}</span>${g.sub && rh >= 40 ? `<span class="s">${esc(g.sub)}</span>` : ''}</div><div>${nf(g.results)}</div><div>${g.results ? money(g.cost) : '-'}</div></div>`).join('');
    const daily = showDaily ? `<div class="daily"><h4>Atendimento por dia · ${esc(m.att.periodo.replace(' a ', ' a '))}</h4><table><tr><th>Dia</th>${m.att.days.map(d => `<th>${esc(d)}</th>`).join('')}</tr>${dailyRows.map((r, i) => `<tr><td>${esc(r.label)}</td>${r.values.map(v => `<td>${nf(v)}</td>`).join('')}</tr>`).join('')}</table></div>` : '';
    return `<div class="panel${showDaily ? ' dense' : ''}"><div class="ph"><div class="circ">${ICON.camadas}</div><h2>Desempenho por grupo de campanha</h2></div><div class="th"><span>Grupo de campanha</span><span>${esc(u.rotulo)}</span><span>CUSTO/RESULT.</span></div><div class="rows" style="--rh:${rh}px;--nf:${nf1}px;--vf:${vf}px">${rows}</div>${nota ? `<div class="nota-t">${esc(nota)}</div>` : ''}${daily}</div>`;
  }

  function render(m, texts, opts) {
    opts = opts || {};
    const u = m.unit, t = m.totals;
    const logo = (opts.base || '') + 'logo-hurtz-vermelho.png';
    const box = (cls, icon, h, text) => `<div class="box"><div class="bi ${cls}">${ICON[icon]}</div><div class="bc"><h3>${h}</h3><div class="r2"></div><p data-fith>${esc(text)}</p></div></div>`;
    const spendSubFinal = m.outros.length && m.hasConversa && m.outros.some(o => o.kind === 'visita_perfil') ? 'MENSAGENS + PERFIL' : 'TODAS AS CAMPANHAS';
    return `<div class="rel" id="relatorio">
      <div class="topbar"></div>
      <div class="titulo">Relatório de Performance</div>
      <div class="cliente" data-fitw>${esc(m.nome)}</div>
      <div class="divv"></div><img class="logo" src="${logo}" alt="Hurtz">
      <div class="meta"><span class="cal">${ICON.cal}</span><b>Período:&nbsp;</b>&nbsp;${esc(m.periodo)}<span class="sep"></span><b>Campanhas:</b><span class="camp">${esc(m.campanhas.join(' • '))}</span></div>
      <div class="cards">
        ${card('pessoas', 'Resultados', u.cardSub, nf(t.results))}
        ${card('alvo', 'Custo por resultado', u.custoSub, money(t.cost))}
        ${card('real', 'Valor gasto', spendSubFinal, money(t.spendAll))}
        ${fourthCard(m)}
        ${panel(m, texts)}
      </div>
      <div class="boxes">
        ${box('a', 'doc', 'Resumo do período', texts.resumo)}
        ${box('b', 'check', 'O que está bom', texts.bom)}
        ${box('b', 'trend', 'O que pode melhorar', texts.melhorar)}
      </div>
      <div class="fnote">${esc(texts.nota || '')}</div>
      <div class="footer">Relatório desenvolvido por <b>Hurtz</b></div>
    </div>`;
  }

  /* ajusta fontes: [data-fitw] encolhe até caber na largura do pai; [data-fith] até caber na altura */
  function fit(el) {
    el.querySelectorAll('[data-fitw]').forEach(n => {
      let fs = parseFloat(getComputedStyle(n).fontSize);
      const lim = n.classList.contains('cliente') ? 1440 : n.parentElement.clientWidth - 24;
      while (n.scrollWidth > lim && fs > 16) { fs -= 1; n.style.fontSize = fs + 'px'; }
    });
    const ps = [...el.querySelectorAll('[data-fith]')];
    let min = 22;
    ps.forEach(n => {
      let fs = parseFloat(getComputedStyle(n).fontSize);
      while (n.scrollHeight > n.clientHeight + 1 && fs > 14) { fs -= 0.5; n.style.fontSize = fs + 'px'; }
      min = Math.min(min, fs);
    });
    ps.forEach(n => { n.style.fontSize = min + 'px'; });
    const camp = el.querySelector('.meta .camp'), meta = el.querySelector('.meta');
    if (camp) {
      let fs = 26;
      while (meta.scrollWidth > meta.clientWidth + 1 && fs > 18) { fs -= 1; camp.style.fontSize = fs + 'px'; }
      if (meta.scrollWidth > meta.clientWidth + 1) camp.style.cssText += ';flex:1 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis';
    }
  }

  return { render, fit };
});
