(() => {
  const C = HurtzCore, R = HurtzReport;
  const $ = s => document.querySelector(s);
  const stage = $('#stage'), editor = $('#editor');
  const state = { clients: [], cur: -1, saved: {} };
  const meta = { clientes: [] };
  let seq = 0;
  const TEXT_KEYS = ['resumo', 'bom', 'melhorar', 'nota', 'notaTabela'];
  const cur = () => state.clients[state.cur];
  const setStatus = (t, err) => { const s = $('#status'); s.hidden = !t; s.textContent = t || ''; s.classList.toggle('err', !!err); };
  const curto = nome => C.titleCase(String(nome).replace(/^CA\s*-\s*/i, '').replace(/^CONTA\s+/i, ''));

  /* ---------- arquivos ---------- */
  async function sheetRows(file) {
    const isCsv = /\.csv$/i.test(file.name);
    const wb = isCsv ? XLSX.read(await file.text(), { type: 'string' }) : XLSX.read(await file.arrayBuffer(), { type: 'array' });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  }

  function addClient(parsed, fileName, nome, slugFixo) {
    if (!parsed.rows.length) throw new Error('Nenhuma campanha com gasto nesse período.');
    const slug = slugFixo || C.slug(nome);
    const saved = state.saved[slug];
    const cfg = Object.assign(C.defaultCfg(), saved && saved.cfg, saved && saved.cfg ? {} : { nome });
    if (!cfg.nome) cfg.nome = nome;
    cfg.periodo = ''; cfg.campanhasTxt = '';
    const mc = meta.clientes.find(x => x.slug === slug);
    if (mc && mc.grupos && !(saved && saved.cfg && saved.cfg.keywords)) cfg.keywords = mc.grupos.concat(C.DEFAULT_KEYWORDS);
    const antigo = state.clients.findIndex(c => c.slug === slug);
    const c = {
      id: ++seq, fileName, parsed, cfg, slug, attRaw: '', attRange: { ini: '', fim: '' },
      attLayout: { card: null, tabela: null, ratio: { num: -1, den: -1, label: '' }, periodo: '' },
      savedAtt: saved && saved.attLayout, texts: {}, edited: {},
    };
    if (antigo >= 0) { c.attRaw = state.clients[antigo].attRaw; c.attRange = state.clients[antigo].attRange; state.clients[antigo] = c; } else state.clients.push(c);
    recompute(c);
  }

  async function addFile(file) {
    try { addClient(C.parseRows(await sheetRows(file)), file.name, C.nomeDoArquivo(file.name)); }
    catch (e) { setStatus(`${file.name}: ${e.message}`, true); console.error(e); }
  }

  async function addFiles(files) {
    const antes = state.clients.length;
    for (const f of files) await addFile(f);
    renderClients();
    if (state.clients.length > antes) select(state.clients.length - 1);
    else if (state.cur < 0 && state.clients.length) select(0);
  }

  /* ---------- cálculo ---------- */
  const rangeOf = c => ({ ini: c.attRange.ini || c.parsed.start, fim: c.attRange.fim || c.parsed.end });
  function recompute(c) {
    c.attParsed = c.attRaw.trim() ? C.parseAtendimento(c.attRaw, rangeOf(c)) : null;
    if (c.attParsed && c.attParsed.rows.length && c.attLayout.card === null && c.savedAtt) applySavedAtt(c);
    const att = c.attParsed && c.attParsed.rows.length ? C.prepararAtendimento(c.attParsed, c.attLayout) : null;
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
    $('#clients').innerHTML = state.clients.map((c, i) => `<li data-i="${i}" class="${i === state.cur ? 'on' : ''}" title="${C.esc(c.cfg.nome)}"><span class="nm">${C.esc(curto(c.cfg.nome))}</span>${c.attParsed && c.attParsed.rows.length ? '<i class="badge">A</i>' : ''}<span class="x" data-x="${i}" title="remover">×</span></li>`).join('');
    $('#count').textContent = state.clients.length;
    $('#clientsEmpty').hidden = state.clients.length > 0;
    $('#zip').disabled = !state.clients.length;
  }
  $('#clients').addEventListener('click', e => {
    const x = e.target.closest('[data-x]');
    if (x) {
      state.clients.splice(+x.dataset.x, 1);
      state.cur = Math.min(state.cur, state.clients.length - 1);
      renderClients();
      if (state.cur >= 0) select(state.cur);
      else { editor.innerHTML = '<div class="placeholder"><strong>Comece pelos dados</strong><p>Puxe da Meta ou solte uma planilha.</p></div>'; stage.innerHTML = ''; toggleBtns(); }
      return;
    }
    const li = e.target.closest('li'); if (li) select(+li.dataset.i);
  });

  function toggleBtns() { ['png', 'copy', 'save', 'drive'].forEach(id => { $('#' + id).disabled = !cur(); }); }
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
      return `<tr><td class="n" title="${C.esc(r.name)}">${C.esc(r.name)}</td><td class="num">${C.nf(r.results)}</td><td class="num">${C.nf(r.spend, 2)}</td><td><input type="text" data-g="${C.esc(r.name)}" value="${C.esc(g)}"></td></tr>`;
    }).join('');
    editor.innerHTML = `
      <details open><summary>Cabeçalho</summary><div class="pad">
        <label class="f">Nome no relatório<input type="text" data-k="nome" value="${C.esc(cfg.nome)}"></label>
        <div class="row2">
          <label class="f">Período<input type="text" data-k="periodo" value="${C.esc(cfg.periodo)}" placeholder="${C.esc(m.periodo)}"></label>
          <label class="f">Nome nos textos<input type="text" data-k="nomeTexto" value="${C.esc(cfg.nomeTexto)}" placeholder="${C.esc(m.nomeTexto)}"></label>
        </div>
        <label class="f">Campanhas (separe por •)<input type="text" data-k="campanhasTxt" value="${C.esc(cfg.campanhasTxt)}" placeholder="${C.esc(m.campanhas.join(' • '))}"></label>
      </div></details>

      <details open><summary>Textos<span class="hint">editáveis</span></summary><div class="pad">
        ${[['resumo', 'Resumo do período'], ['bom', 'O que está bom'], ['melhorar', 'O que pode melhorar'], ['notaTabela', 'Nota abaixo da tabela'], ['nota', 'Nota de rodapé']].map(([k, l]) => `<label class="f">${l}<textarea data-t="${k}" rows="${k.startsWith('nota') ? 2 : 4}">${C.esc(c.texts[k] || '')}</textarea></label>`).join('')}
        <button class="btn" data-act="regen" type="button">Regenerar textos automáticos</button>
      </div></details>

      <details${c.attRaw ? ' open' : ''}><summary>Atendimento<span class="hint">opcional</span></summary><div class="pad">
        <span class="small">Cole o texto bruto do grupo (ou a conversa exportada do WhatsApp) e eu procuro os relatórios diários. Também aceita uma tabela com os dias nas colunas.</span>
        <textarea data-att rows="7" placeholder="Cole aqui. Exemplo:&#10;Relatório diário 21/10&#10;Pacientes: 22&#10;Consultas: 4&#10;Procedimento agendado: 1">${C.esc(c.attRaw)}</textarea>
        <label class="f">Ou importe um arquivo (.txt do WhatsApp, .csv, .xlsx)<input type="file" data-attfile accept=".txt,.md,.csv,.xlsx,.xls"></label>
        <div class="row2">
          <label class="f">Considerar de<input type="date" data-attini value="${C.esc(c.attRange.ini)}"></label>
          <label class="f">até<input type="date" data-attfim value="${C.esc(c.attRange.fim)}"></label>
        </div>
        <span class="small" id="attRangeHint"></span>
        <div id="attLayout">${attLayoutHtml(c)}</div>
      </div></details>

      <details><summary>Campanhas e grupos<span class="hint">${c.parsed.rows.length} campanhas</span></summary><div class="pad">
        <span class="small">Campanhas com o mesmo nome de grupo somam numa linha da tabela.</span>
        <div class="tw" style="max-height:300px"><table class="t"><tr><th>Campanha</th><th class="num">Result.</th><th class="num">Gasto</th><th>Grupo</th></tr>${rowsHtml}</table></div>
        <span class="small">Como cada indicador conta:</span>
        ${kinds.map(k => { const info = C.indicatorByKind(k); return `<label class="f">${C.esc(info.label || k)}${roleSel(k, cfg.roles[k] || info.role)}</label>`; }).join('')}
      </div></details>

      <details><summary>Opções</summary><div class="pad">
        <label class="f">Mostrar tipo (Mensagens/Formulário) na tabela<select data-k="mostrarTipo">${opt(cfg.mostrarTipo, [['auto', 'Automático'], ['sim', 'Sempre'], ['nao', 'Nunca']])}</select></label>
        <label class="f">4º cartão<select data-k="fourth">${opt(cfg.fourth, [['auto', 'Automático'], ['total', 'Total confirmado'], ['outros', 'Outros resultados'], ['atendimento', 'Atendimento']])}</select></label>
        <label class="f">Nome do resultado<select data-k="unit">${opt(cfg.unit, [['auto', 'Automático'], ['conversas', 'Conversas'], ['leads', 'Leads'], ['resultados', 'Resultados'], ['agendamentos', 'Agendamentos']])}</select></label>
      </div></details>`;
    rangeHint(c);
  }

  function rangeHint(c) {
    const el = $('#attRangeHint'); if (!el) return;
    const r = rangeOf(c);
    el.textContent = `Sem datas preenchidas, vale o período do relatório (${r.ini ? r.ini.split('-').reverse().slice(0, 2).join('/') : '?'} a ${r.fim ? r.fim.split('-').reverse().slice(0, 2).join('/') : '?'}).`;
  }

  function attLayoutHtml(c) {
    const a = c.attParsed;
    if (!c.attRaw.trim()) return '';
    if (!a) return '<ul class="avisos warn"><li>Não achei relatórios diários nem tabela nesse texto. Procuro mensagens com "Relatório diário" seguidas de linhas como "Pacientes: 12".</li></ul>';
    const avisos = (a.avisos || []).length ? `<ul class="avisos${a.rows.length ? '' : ' warn'}">${a.avisos.map(v => `<li>${C.esc(v)}</li>`).join('')}</ul>` : '';
    if (!a.rows.length) return avisos;
    const L = c.attLayout;
    const inCard = i => (L.card ? L.card.includes(i) : i < 3), inTab = i => (L.tabela ? L.tabela.includes(i) : true);
    const opts = sel => `<option value="-1">(nenhum)</option>` + a.rows.map((r, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${C.esc(r.label)}</option>`).join('');
    const grade = `<div class="tw"><table class="t grid"><tr><th>Lido</th>${a.days.map(d => `<th>${C.esc(d)}</th>`).join('')}<th>Total</th></tr>${a.rows.map(r => `<tr><td>${C.esc(r.label)}</td>${r.values.map(v => `<td>${C.nf(v)}</td>`).join('')}<td><b>${C.nf(r.total)}</b></td></tr>`).join('')}</table></div>`;
    const uso = `<div class="tw"><table class="t"><tr><th>Indicador</th><th>No cartão</th><th>Na tabela</th></tr>${a.rows.map((r, i) => `<tr><td>${C.esc(r.label)}</td><td><input type="checkbox" data-card="${i}"${inCard(i) ? ' checked' : ''}></td><td><input type="checkbox" data-tab="${i}"${inTab(i) ? ' checked' : ''}></td></tr>`).join('')}</table></div>`;
    return `${avisos}${grade}${uso}
      <div class="row2"><label class="f">Taxa: numerador<select data-ratio="num">${opts(L.ratio.num)}</select></label><label class="f">Taxa: denominador<select data-ratio="den">${opts(L.ratio.den)}</select></label></div>
      <label class="f">Nome da taxa<input type="text" data-ratio="label" value="${C.esc(L.ratio.label)}" placeholder="Consultas / pacientes"></label>
      <label class="f">Período mostrado no relatório<input type="text" data-attper value="${C.esc(L.periodo)}" placeholder="${C.esc(a.periodo)}"></label>`;
  }

  /* ---------- eventos do editor ---------- */
  let timer;
  const later = fn => { clearTimeout(timer); timer = setTimeout(fn, 150); };
  function update(structural) {
    const c = cur(); recompute(c); syncTexts(c); draw();
    if (structural && $('#attLayout')) $('#attLayout').innerHTML = attLayoutHtml(c);
    if (document.activeElement && document.activeElement.dataset.k === 'nome') renderClients();
    else if (structural) renderClients();
  }
  function syncTexts(c) {
    editor.querySelectorAll('[data-t]').forEach(t => { if (t !== document.activeElement) t.value = c.texts[t.dataset.t] || ''; });
    editor.querySelectorAll('[data-k="nomeTexto"],[data-k="periodo"],[data-k="campanhasTxt"]').forEach(i => {
      i.placeholder = { nomeTexto: c.model.nomeTexto, periodo: c.model.periodo, campanhasTxt: c.model.campanhas.join(' • ') }[i.dataset.k];
    });
  }
  const resetAtt = c => { c.attLayout.card = c.attLayout.tabela = null; };

  editor.addEventListener('input', e => {
    const c = cur(), t = e.target; if (!c) return;
    if (t.dataset.k) { c.cfg[t.dataset.k] = t.value; later(() => update()); }
    else if (t.dataset.g !== undefined) {
      const guess = C.guessGroup(t.dataset.g, c.cfg.keywords);
      if (t.value.trim() && t.value.trim().toUpperCase() !== guess) c.cfg.groups[t.dataset.g] = t.value.trim(); else delete c.cfg.groups[t.dataset.g];
      later(() => update());
    } else if (t.dataset.t) { c.texts[t.dataset.t] = t.value; c.edited[t.dataset.t] = true; later(draw); }
    else if (t.dataset.att !== undefined) { c.attRaw = t.value; resetAtt(c); later(() => update(true)); }
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
    else if (t.dataset.attini !== undefined) { c.attRange.ini = t.value; resetAtt(c); update(true); }
    else if (t.dataset.attfim !== undefined) { c.attRange.fim = t.value; resetAtt(c); update(true); }
    else if (t.dataset.attfile !== undefined && t.files[0]) {
      const f = t.files[0];
      if (/\.(xlsx|xls)$/i.test(f.name)) {
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
        c.attRaw = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { FS: '\t' });
      } else c.attRaw = await f.text();
      resetAtt(c);
      recompute(c); renderEditor(); renderClients(); draw();
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
    try {
      const zip = new JSZip();
      for (let k = 0; k < state.clients.length; k++) {
        setStatus(`Gerando imagens ${k + 1}/${state.clients.length}...`);
        const u = await toPng(state.clients[k], ratio()); zip.file(fileNameOf(state.clients[k]), u.split(',')[1], { base64: true });
      }
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
  window.addEventListener('drop', e => { e.preventDefault(); if (e.target !== drop && !drop.contains(e.target) && e.dataTransfer.files.length && !e.target.closest('textarea,input')) addFiles([...e.dataTransfer.files]); });

  fetch('/api/config').then(r => r.json()).then(j => { state.saved = j; }).catch(() => {
    try { state.saved = JSON.parse(localStorage.getItem('hurtz-rel-cfg') || '{}'); } catch { }
  });

  /* ---------- Meta + Drive (só na versão hospedada, atrás de login) ---------- */
  const segunda = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7); return d; };
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

  /* modo convidado: sem senha, só planilhas. O servidor continua bloqueando /api sem sessão. */
  const convidado = () => { try { return sessionStorage.getItem('rel-convidado') === '1'; } catch { return false; } };
  function modoConvidado(on) {
    try { on ? sessionStorage.setItem('rel-convidado', '1') : sessionStorage.removeItem('rel-convidado'); } catch { }
    $('#login').hidden = true;
    $('#metaPanel').hidden = true; $('#driveGrp').hidden = true;
    $('#modo').hidden = false; $('#modo').textContent = 'Modo convidado: só planilhas';
    $('#entrar').hidden = false;
  }
  $('#convidado').onclick = () => modoConvidado(true);
  $('#entrar').onclick = () => { try { sessionStorage.removeItem('rel-convidado'); } catch { } $('#login').hidden = false; $('#senha').focus(); };
  $('#login').addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modo').hidden) $('#login').hidden = true; });

  async function initMeta() {
    let r;
    try { r = await fetch('/api/clientes'); } catch { return; }
    if (r.status === 401) { if (convidado()) modoConvidado(true); else { $('#login').hidden = false; $('#senha').focus(); } return; }
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return; // servidor local, sem integração
    try { sessionStorage.removeItem('rel-convidado'); } catch { }
    $('#login').hidden = true; $('#entrar').hidden = true;
    $('#modo').hidden = false; $('#modo').textContent = 'Acesso completo';
    meta.clientes = await r.json();
    const ini = segunda(), fim = new Date(ini); fim.setDate(fim.getDate() + 6);
    $('#metaPanel').hidden = false; $('#driveGrp').hidden = false;
    $('#mIni').value = iso(ini); $('#mFim').value = iso(fim);
    $('#mLista').innerHTML = meta.clientes.map(c => `<label title="${C.esc(c.nome)}"><input type="checkbox" data-slug="${c.slug}" checked><span class="nm">${C.esc(curto(c.nome))}</span>${c.atendimento ? '<i class="badge" title="recebe dados de atendimento">A</i>' : ''}</label>`).join('');
  }
  $('#loginBtn').onclick = async () => {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ senha: $('#senha').value }) });
    if (r.ok) { $('#senha').value = ''; $('#loginErr').textContent = ''; initMeta(); } else $('#loginErr').textContent = 'Senha incorreta';
  };
  $('#senha').addEventListener('keydown', e => { if (e.key === 'Enter') $('#loginBtn').click(); });
  $('#mTodos').onclick = () => { const marcar = [...document.querySelectorAll('#mLista input')].some(i => !i.checked); document.querySelectorAll('#mLista input').forEach(i => { i.checked = marcar; }); };

  $('#mPuxar').onclick = async () => {
    const ini = $('#mIni').value, fim = $('#mFim').value;
    const slugs = [...document.querySelectorAll('#mLista input:checked')].map(i => i.dataset.slug);
    if (!ini || !fim || ini > fim) return setStatus('Confira as datas.', true);
    if (!slugs.length) return setStatus('Marque ao menos um cliente.', true);
    $('#mPuxar').disabled = true;
    const falhas = []; let ok = 0;
    for (let k = 0; k < slugs.length; k++) {
      setStatus(`Puxando da Meta ${k + 1}/${slugs.length}...`);
      try {
        const r = await fetch(`/api/meta?slug=${slugs[k]}&inicio=${ini}&fim=${fim}`);
        if (r.status === 401) { $('#login').hidden = false; throw new Error('sessão expirada, entre de novo'); }
        const j = await r.json();
        if (j.erro) throw new Error(j.erro);
        const antes = state.clients.findIndex(c => c.slug === slugs[k]);
        if (antes >= 0 && !j.rows.length) state.clients.splice(antes, 1); // semana sem gasto: tira o relatório antigo
        addClient(C.parseRows(j.rows), slugs[k] + '.meta', j.nome, slugs[k]); ok++;
      } catch (e) {
        const nome = (meta.clientes.find(x => x.slug === slugs[k]) || {}).nome || slugs[k];
        falhas.push(`${curto(nome)}: ${e.message.replace('Nenhuma campanha com gasto nesse período.', 'sem gasto no período')}`);
      }
    }
    $('#mPuxar').disabled = false;
    state.cur = Math.min(Math.max(state.cur, 0), state.clients.length - 1);
    renderClients();
    if (state.clients.length) select(state.cur);
    setStatus(`${ok} relatório(s) montados.${falhas.length ? ' Não vieram: ' + falhas.join('; ') + '.' : ''} Confira e baixe ou envie ao Drive.`, false);
  };

  async function enviarDrive(c) {
    const pasta = `${c.parsed.start} a ${c.parsed.end}`;
    const blob = await (await fetch(await toPng(c, ratio()))).blob();
    const r = await fetch(`/api/drive?pasta=${encodeURIComponent(pasta)}&nome=${encodeURIComponent(fileNameOf(c))}`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
    const j = await r.json();
    if (j.erro) throw new Error(j.erro);
    return j;
  }
  $('#drive').onclick = async () => {
    const lista = $('#driveTodos').checked ? state.clients : [cur()];
    let ult = null;
    try {
      for (let k = 0; k < lista.length; k++) { setStatus(`Enviando ao Drive ${k + 1}/${lista.length}...`); ult = await enviarDrive(lista[k]); }
      setStatus(`Enviado ao Drive (${lista.length}).`);
      $('#driveLink').href = ult.pasta; $('#driveLink').hidden = false;
    } catch (e) { setStatus('Erro no Drive: ' + e.message, true); }
  };
  initMeta();

  // API usada pela CLI (gerar.js)
  window.__hurtz = {
    state, addFiles,
    png: (i, r) => toPng(state.clients[i], r || 1),
    apply(i, o) {
      const c = state.clients[i]; o = o || {};
      if (o.cfg) Object.assign(c.cfg, o.cfg);
      if (o.attRaw != null) { c.attRaw = o.attRaw; resetAtt(c); }
      if (o.attRange) Object.assign(c.attRange, o.attRange);
      if (o.attLayout) Object.assign(c.attLayout, o.attLayout);
      recompute(c);
      if (o.texts) { Object.assign(c.texts, o.texts); Object.keys(o.texts).forEach(k => { c.edited[k] = true; }); }
      return { nome: c.cfg.nome, slug: c.slug, fim: c.parsed.end, model: { periodo: c.model.periodo, unit: c.model.unit.plural, fourth: c.model.fourth, campanhas: c.model.campanhas, totals: c.model.totals, groups: c.model.groups, zero: c.model.zero.map(z => ({ name: z.name, spend: z.spend })), outros: c.model.outros.map(o => ({ kind: o.kind, results: o.results, spend: o.spend })), att: c.attParsed ? c.attParsed.rows.map(r => ({ label: r.label, total: r.total })) : null }, texts: c.texts };
    },
  };
})();
