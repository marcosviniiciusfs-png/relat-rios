(() => {
  const C = HurtzCore, R = HurtzReport;
  const $ = s => document.querySelector(s);
  const stage = $('#stage'), editor = $('#editor');
  const state = { clients: [], cur: -1, saved: {} };
  let seq = 0;
  const TEXT_KEYS = ['resumo', 'bom', 'melhorar', 'nota', 'notaTabela'];
  const cur = () => state.clients[state.cur];
  const setStatus = (t, err) => { const s = $('#status'); s.textContent = t || ''; s.style.color = err ? '#c0210a' : ''; };

  /* ---------- arquivos ---------- */
  async function sheetRows(file) {
    const isCsv = /\.csv$/i.test(file.name);
    const wb = isCsv ? XLSX.read(await file.text(), { type: 'string' }) : XLSX.read(await file.arrayBuffer(), { type: 'array' });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  }

  async function addFile(file) {
    try {
      const parsed = C.parseRows(await sheetRows(file));
      if (!parsed.rows.length) throw new Error('Nenhuma campanha com gasto nessa planilha.');
      const nome = C.nomeDoArquivo(file.name);
      const slug = C.slug(nome);
      const saved = state.saved[slug];
      const cfg = Object.assign(C.defaultCfg(), saved && saved.cfg, saved && saved.cfg ? {} : { nome });
      if (!cfg.nome) cfg.nome = nome;
      cfg.periodo = ''; cfg.campanhasTxt = '';
      state.clients.push({
        id: ++seq, fileName: file.name, parsed, cfg, slug, attRaw: '', attLayout: { card: null, tabela: null, ratio: { num: -1, den: -1, label: '' }, periodo: '' },
        savedAtt: saved && saved.attLayout, texts: {}, edited: {},
      });
      recompute(state.clients[state.clients.length - 1]);
    } catch (e) { setStatus(`${file.name}: ${e.message}`, true); console.error(e); }
  }

  async function addFiles(files) {
    for (const f of files) await addFile(f);
    renderClients();
    if (state.cur < 0 && state.clients.length) select(0);
    else if (state.clients.length) select(state.clients.length - files.length >= 0 ? state.clients.length - 1 : 0);
  }

  /* ---------- cálculo ---------- */
  function recompute(c) {
    c.attParsed = c.attRaw.trim() ? C.parseAtendimento(c.attRaw) : null;
    if (c.attParsed && c.attLayout.card === null && c.savedAtt) applySavedAtt(c);
    const att = c.attParsed ? C.prepararAtendimento(c.attParsed, c.attLayout) : null;
    c.model = C.buildModel(c.parsed, c.cfg, att);
    c.auto = C.gerarTextos(c.model);
    TEXT_KEYS.forEach(k => { if (!c.edited[k]) c.texts[k] = c.auto[k]; });
  }
  function applySavedAtt(c) {
    const s = c.savedAtt, labels = c.attParsed.rows.map(r => C.norm(r.label));
    const idx = l => labels.indexOf(C.norm(l));
    const card = (s.cardLabels || []).map(idx).filter(i => i >= 0);
    if (card.length) c.attLayout.card = card;
    if (s.ratio) c.attLayout.ratio = { num: idx(s.ratio.num), den: idx(s.ratio.den), label: s.ratio.label || '' };
  }

  /* ---------- lista de clientes ---------- */
  function renderClients() {
    $('#clients').innerHTML = state.clients.map((c, i) => `<li data-i="${i}" class="${i === state.cur ? 'on' : ''}"><span>${C.esc(c.cfg.nome)}</span><span class="x" data-x="${i}" title="remover">×</span></li>`).join('');
    $('#zip').disabled = !state.clients.length;
  }
  $('#clients').addEventListener('click', e => {
    const x = e.target.closest('[data-x]');
    if (x) { state.clients.splice(+x.dataset.x, 1); state.cur = Math.min(state.cur, state.clients.length - 1); renderClients(); state.cur >= 0 ? select(state.cur) : (editor.innerHTML = '<p class="empty">Nenhum cliente carregado ainda.</p>', stage.innerHTML = '', toggleBtns()); return; }
    const li = e.target.closest('li'); if (li) select(+li.dataset.i);
  });

  function toggleBtns() { ['png', 'copy', 'save'].forEach(id => $('#' + id).disabled = !cur()); }
  function select(i) { state.cur = i; renderClients(); renderEditor(); toggleBtns(); draw(); }

  /* ---------- editor ---------- */
  const roleSel = (kind, v) => `<select data-role="${C.esc(kind)}">${[['principal', 'Resultado principal'], ['outro', 'Outro resultado'], ['ignorar', 'Ignorar']].map(([k, l]) => `<option value="${k}"${k === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  const opt = (v, list) => list.map(([k, l]) => `<option value="${k}"${k === v ? ' selected' : ''}>${l}</option>`).join('');

  function renderEditor() {
    const c = cur(); if (!c) return;
    const cfg = c.cfg, m = c.model;
    const kinds = [...new Set(c.parsed.rows.map(r => r.kind))];
    const rowsHtml = c.parsed.rows.map(r => {
      const g = cfg.groups[r.name] || C.guessGroup(r.name, cfg.keywords);
      return `<tr><td class="n" title="${C.esc(r.name)}">${C.esc(r.name)}</td><td>${C.nf(r.results)}</td><td>${C.nf(r.spend, 2)}</td><td><input type="text" data-g="${C.esc(r.name)}" value="${C.esc(g)}"></td></tr>`;
    }).join('');
    editor.innerHTML = `
      <details open><summary>Cabeçalho</summary><div>
        <label class="f">Nome no relatório<input type="text" data-k="nome" value="${C.esc(cfg.nome)}"></label>
        <label class="f">Nome nos textos (ex.: Dra. Alexia Lima)<input type="text" data-k="nomeTexto" value="${C.esc(cfg.nomeTexto)}" placeholder="${C.esc(m.nomeTexto)}"></label>
        <label class="f">Período<input type="text" data-k="periodo" value="${C.esc(cfg.periodo)}" placeholder="${C.esc(m.periodo)}"></label>
        <label class="f">Campanhas (separe por •)<input type="text" data-k="campanhasTxt" value="${C.esc(cfg.campanhasTxt)}" placeholder="${C.esc(m.campanhas.join(' • '))}"></label>
      </div></details>
      <details open><summary>Campanhas e grupos</summary><div>
        <span class="small">Campanhas com o mesmo nome de grupo somam numa linha da tabela.</span>
        <table class="t"><tr><th>Campanha</th><th>Result.</th><th>Gasto</th><th>Grupo</th></tr>${rowsHtml}</table>
        <span class="small">Tipo de resultado de cada indicador:</span>
        ${kinds.map(k => { const info = C.indicatorByKind(k); return `<label class="f">${C.esc(info.label || k)}${roleSel(k, cfg.roles[k] || info.role)}</label>`; }).join('')}
      </div></details>
      <details><summary>Opções</summary><div>
        <label class="f">Mostrar tipo (Mensagens/Formulário) na tabela<select data-k="mostrarTipo">${opt(cfg.mostrarTipo, [['auto', 'Automático'], ['sim', 'Sempre'], ['nao', 'Nunca']])}</select></label>
        <label class="f">4º cartão<select data-k="fourth">${opt(cfg.fourth, [['auto', 'Automático'], ['total', 'Total confirmado'], ['outros', 'Outros resultados'], ['atendimento', 'Atendimento']])}</select></label>
        <label class="f">Nome do resultado<select data-k="unit">${opt(cfg.unit, [['auto', 'Automático'], ['conversas', 'Conversas'], ['leads', 'Leads'], ['resultados', 'Resultados'], ['agendamentos', 'Agendamentos']])}</select></label>
      </div></details>
      <details open><summary>Textos</summary><div>
        ${[['resumo', 'Resumo do período'], ['bom', 'O que está bom'], ['melhorar', 'O que pode melhorar'], ['notaTabela', 'Nota abaixo da tabela'], ['nota', 'Nota de rodapé']].map(([k, l]) => `<label class="f">${l}<textarea data-t="${k}" rows="${k.startsWith('nota') ? 2 : 4}">${C.esc(c.texts[k] || '')}</textarea></label>`).join('')}
        <button class="btn" data-act="regen">Regenerar textos automáticos</button>
      </div></details>
      <details${c.attRaw ? ' open' : ''}><summary>Atendimento (opcional)</summary><div>
        <span class="small">Cole da planilha: 1ª linha = dias (19/10, 20/10...), 1ª coluna = indicador (Pacientes, Consultas, Agendamentos...). Ou importe um arquivo.</span>
        <textarea data-att rows="6" placeholder="Dia&#9;19/10&#9;20/10&#9;21/10&#10;Pacientes&#9;13&#9;17&#9;22&#10;Consultas&#9;3&#9;2&#9;4">${C.esc(c.attRaw)}</textarea>
        <input type="file" data-attfile accept=".xlsx,.xls,.csv">
        <div id="attLayout">${attLayoutHtml(c)}</div>
      </div></details>`;
  }

  function attLayoutHtml(c) {
    const a = c.attParsed; if (!a) return c.attRaw ? '<span class="small">Não consegui ler. Precisa de pelo menos 2 linhas.</span>' : '';
    const L = c.attLayout, m = c.model;
    const inCard = i => (L.card ? L.card.includes(i) : i < 3), inTab = i => (L.tabela ? L.tabela.includes(i) : true);
    const opts = sel => `<option value="-1">(nenhum)</option>` + a.rows.map((r, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${C.esc(r.label)}</option>`).join('');
    return `<table class="t"><tr><th>Indicador</th><th>Total</th><th>Cartão</th><th>Tabela</th></tr>${a.rows.map((r, i) => `<tr><td>${C.esc(r.label)}</td><td>${C.nf(r.total)}</td><td><input type="checkbox" data-card="${i}"${inCard(i) ? ' checked' : ''}></td><td><input type="checkbox" data-tab="${i}"${inTab(i) ? ' checked' : ''}></td></tr>`).join('')}</table>
      <div class="row2"><label class="f">Taxa: numerador<select data-ratio="num">${opts(L.ratio.num)}</select></label><label class="f">Taxa: denominador<select data-ratio="den">${opts(L.ratio.den)}</select></label></div>
      <label class="f">Nome da taxa<input type="text" data-ratio="label" value="${C.esc(L.ratio.label)}" placeholder="Consultas / pacientes"></label>
      <label class="f">Período do atendimento<input type="text" data-attper value="${C.esc(L.periodo)}" placeholder="${C.esc(a.periodo)}"></label>`;
  }

  /* ---------- eventos do editor ---------- */
  let timer;
  const later = fn => { clearTimeout(timer); timer = setTimeout(fn, 120); };
  function update(structural) {
    const c = cur(); recompute(c); syncTexts(c); draw();
    if (structural) $('#attLayout') && ($('#attLayout').innerHTML = attLayoutHtml(c));
    if (document.activeElement && document.activeElement.dataset.k === 'nome') renderClients();
  }
  function syncTexts(c) {
    editor.querySelectorAll('[data-t]').forEach(t => { if (t !== document.activeElement) t.value = c.texts[t.dataset.t] || ''; });
    editor.querySelectorAll('[data-k="nomeTexto"],[data-k="periodo"],[data-k="campanhasTxt"]').forEach(i => {
      i.placeholder = { nomeTexto: c.model.nomeTexto, periodo: c.model.periodo, campanhasTxt: c.model.campanhas.join(' • ') }[i.dataset.k];
    });
  }

  editor.addEventListener('input', e => {
    const c = cur(), t = e.target; if (!c) return;
    if (t.dataset.k) { c.cfg[t.dataset.k] = t.value; later(() => update()); }
    else if (t.dataset.g !== undefined) {
      const guess = C.guessGroup(t.dataset.g, c.cfg.keywords);
      if (t.value.trim() && t.value.trim().toUpperCase() !== guess) c.cfg.groups[t.dataset.g] = t.value.trim(); else delete c.cfg.groups[t.dataset.g];
      later(() => update());
    } else if (t.dataset.t) { c.texts[t.dataset.t] = t.value; c.edited[t.dataset.t] = true; later(draw); }
    else if (t.dataset.att !== undefined) { c.attRaw = t.value; c.attLayout.card = c.attLayout.tabela = null; later(() => update(true)); }
    else if (t.dataset.attper !== undefined) { c.attLayout.periodo = t.value; later(() => update()); }
    else if (t.dataset.ratio === 'label') { c.attLayout.ratio.label = t.value; later(() => update()); }
  });
  editor.addEventListener('change', async e => {
    const c = cur(), t = e.target; if (!c) return;
    if (t.dataset.role) { c.cfg.roles[t.dataset.role] = t.value; update(); }
    else if (t.dataset.k && t.tagName === 'SELECT') { c.cfg[t.dataset.k] = t.value; update(); }
    else if (t.dataset.card !== undefined || t.dataset.tab !== undefined) {
      const key = t.dataset.card !== undefined ? 'card' : 'tabela', i = +(t.dataset.card ?? t.dataset.tab);
      const n = c.attParsed.rows.length;
      const base = c.attLayout[key] || (key === 'card' ? [0, 1, 2].filter(x => x < n) : [...Array(n).keys()]);
      c.attLayout[key] = t.checked ? [...new Set([...base, i])].sort((a, b) => a - b) : base.filter(x => x !== i);
      update();
    } else if (t.dataset.ratio === 'num' || t.dataset.ratio === 'den') { c.attLayout.ratio[t.dataset.ratio] = +t.value; update(); }
    else if (t.dataset.attfile !== undefined && t.files[0]) {
      const wb = XLSX.read(/\.csv$/i.test(t.files[0].name) ? await t.files[0].text() : await t.files[0].arrayBuffer(), { type: /\.csv$/i.test(t.files[0].name) ? 'string' : 'array' });
      c.attRaw = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { FS: '\t' });
      c.attLayout.card = c.attLayout.tabela = null;
      recompute(c); renderEditor(); draw();
    }
  });
  editor.addEventListener('click', e => {
    if (e.target.dataset.act === 'regen') { const c = cur(); c.edited = {}; update(); }
  });

  /* ---------- desenho ---------- */
  async function draw() {
    const c = cur();
    if (!c) { stage.innerHTML = ''; return; }
    stage.innerHTML = R.render(c.model, c.texts);
    try { await document.fonts.load('700 20px Inter'); await document.fonts.load('400 20px Inter'); await document.fonts.load('800 20px Inter'); } catch { }
    R.fit(stage);
    scale();
  }
  function scale() { stage.style.transform = `scale(${$('#stagewrap').clientWidth / 1920})`; }
  window.addEventListener('resize', scale);

  /* ---------- exportar ---------- */
  async function toPng(c, pixelRatio) {
    const holder = $('#export');
    holder.innerHTML = R.render(c.model, c.texts);
    const el = holder.firstElementChild;
    await document.fonts.ready;
    R.fit(el);
    const opts = { width: 1920, height: 1080, pixelRatio, cacheBust: false };
    await htmlToImage.toPng(el, opts); // aquecimento: garante fontes e imagens embutidas
    const url = await htmlToImage.toPng(el, opts);
    holder.innerHTML = '';
    return url;
  }
  const fileNameOf = c => `relatorio-${c.slug}-${(c.parsed.end || new Date().toISOString().slice(0, 10))}.png`;
  const download = (href, name) => { const a = document.createElement('a'); a.href = href; a.download = name; a.click(); };
  const ratio = () => +$('#scale').value;

  $('#png').onclick = async () => {
    const c = cur(); setStatus('Gerando imagem...');
    try { download(await toPng(c, ratio()), fileNameOf(c)); setStatus('PNG baixado.'); } catch (e) { setStatus('Erro: ' + e.message, true); console.error(e); }
  };
  $('#copy').onclick = async () => {
    const c = cur(); setStatus('Copiando...');
    try {
      const blob = await (await fetch(await toPng(c, 1))).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setStatus('Imagem copiada. É só colar no WhatsApp.');
    } catch (e) { setStatus('Não deu para copiar: ' + e.message, true); }
  };
  $('#zip').onclick = async () => {
    setStatus('Gerando ZIP...');
    try {
      const zip = new JSZip();
      for (const c of state.clients) { const u = await toPng(c, ratio()); zip.file(fileNameOf(c), u.split(',')[1], { base64: true }); }
      download(URL.createObjectURL(await zip.generateAsync({ type: 'blob' })), `relatorios-${new Date().toISOString().slice(0, 10)}.zip`);
      setStatus(`${state.clients.length} relatórios no ZIP.`);
    } catch (e) { setStatus('Erro: ' + e.message, true); }
  };
  $('#save').onclick = async () => {
    const c = cur(); const { periodo, campanhasTxt, ...cfg } = c.cfg;
    const rows = c.attParsed ? c.attParsed.rows : [];
    const lay = c.attLayout, L = i => (rows[i] ? rows[i].label : '');
    const attLayout = rows.length ? { cardLabels: (lay.card || [0, 1, 2].filter(x => x < rows.length)).map(L), ratio: lay.ratio.num >= 0 && lay.ratio.den >= 0 ? { num: L(lay.ratio.num), den: L(lay.ratio.den), label: lay.ratio.label } : null } : c.savedAtt;
    try {
      let local = false;
      try {
        const r = await fetch('/api/config/' + c.slug, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cfg, attLayout }) });
        if (!r.ok) throw new Error('sem servidor');
      } catch { local = true; }
      state.saved[c.slug] = { cfg, attLayout };
      if (local) localStorage.setItem('hurtz-rel-cfg', JSON.stringify(state.saved));
      setStatus(local ? 'Configuração salva neste navegador para as próximas semanas.' : 'Configuração salva para as próximas semanas.');
    } catch (e) { setStatus('Erro ao salvar: ' + e.message, true); }
  };

  /* ---------- upload ---------- */
  const drop = $('#drop'), input = $('#file');
  input.onchange = () => { addFiles([...input.files]); input.value = ''; };
  ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => addFiles([...e.dataTransfer.files]));
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => { e.preventDefault(); if (e.target !== drop && !drop.contains(e.target)) addFiles([...e.dataTransfer.files]); });

  fetch('/api/config').then(r => r.json()).then(j => { state.saved = j; }).catch(() => {
    try { state.saved = JSON.parse(localStorage.getItem('hurtz-rel-cfg') || '{}'); } catch { }
  });
  // API usada pela CLI (gerar.js)
  window.__hurtz = {
    state, addFiles,
    png: (i, r) => toPng(state.clients[i], r || 1),
    apply(i, o) {
      const c = state.clients[i]; o = o || {};
      if (o.cfg) Object.assign(c.cfg, o.cfg);
      if (o.attRaw != null) { c.attRaw = o.attRaw; c.attLayout.card = c.attLayout.tabela = null; }
      if (o.attLayout) Object.assign(c.attLayout, o.attLayout);
      recompute(c);
      if (o.texts) { Object.assign(c.texts, o.texts); Object.keys(o.texts).forEach(k => { c.edited[k] = true; }); }
      return { nome: c.cfg.nome, slug: c.slug, fim: c.parsed.end, model: { periodo: c.model.periodo, unit: c.model.unit.plural, fourth: c.model.fourth, campanhas: c.model.campanhas, totals: c.model.totals, groups: c.model.groups, zero: c.model.zero.map(z => ({ name: z.name, spend: z.spend })), outros: c.model.outros.map(o => ({ kind: o.kind, results: o.results, spend: o.spend })), att: c.attParsed ? c.attParsed.rows.map(r => ({ label: r.label, total: r.total })) : null }, texts: c.texts };
    },
  };
})();
