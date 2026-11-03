#!/usr/bin/env node
/* Gera os relatórios em PNG sem abrir a interface (usado pelo Claude e para lote).
   Uso:
     node gerar.js --planilha <arquivo.xlsx> [--planilha <outro.xlsx> ...] [--saida <pasta>]
                   [--atendimento <arquivo.tsv|csv|xlsx>] [--ajustes <ajustes.json>] [--escala 1|2] [--so-resumo]
   ajustes.json (tudo opcional): { "cfg": {"nome":"CA - DRA. ALEXIA","periodo":"...","groups":{"<campanha>":"GRUPO"}},
                                   "attLayout": {"card":[0,1,2],"ratio":{"num":1,"den":0,"label":"Consultas / pacientes"}},
                                   "texts": {"resumo":"...","bom":"...","melhorar":"...","nota":"...","notaTabela":"..."} }
   Com várias planilhas, "ajustes" pode ser um objeto {"<nome do arquivo>": {...}}. */
const fs = require('fs');
const path = require('path');
const { start } = require('./server.js');

function args(argv) {
  const o = { planilha: [], saida: path.join(process.cwd(), 'relatorios'), escala: 1 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--planilha') o.planilha.push(argv[++i]);
    else if (a === '--saida') o.saida = argv[++i];
    else if (a === '--atendimento') o.atendimento = argv[++i];
    else if (a === '--ajustes') o.ajustes = argv[++i];
    else if (a === '--escala') o.escala = Number(argv[++i]);
    else if (a === '--so-resumo') o.soResumo = true;
    else { console.error('Argumento desconhecido: ' + a); process.exit(1); }
  }
  if (!o.planilha.length) { console.error('Informe --planilha <arquivo>'); process.exit(1); }
  return o;
}

function chromePath() {
  const c = [process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'];
  const p = c.find(x => x && fs.existsSync(x));
  if (!p) throw new Error('Chrome/Edge não encontrado. Defina CHROME_PATH.');
  return p;
}

(async () => {
  const o = args(process.argv);
  const { chromium } = require('playwright-core');
  const server = await start(0);
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: chromePath() });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    page.on('pageerror', e => console.error('erro na página:', e.message));
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(() => window.__hurtz);
    await page.setInputFiles('#file', o.planilha.map(p => path.resolve(p)));
    await page.waitForFunction(n => window.__hurtz.state.clients.length >= n, o.planilha.length, { timeout: 30000 });
    const ajustes = o.ajustes ? JSON.parse(fs.readFileSync(o.ajustes, 'utf8')) : {};
    const attRaw = o.atendimento ? await attText(o.atendimento) : null;
    fs.mkdirSync(o.saida, { recursive: true });
    const resumos = [];
    for (let i = 0; i < o.planilha.length; i++) {
      const base = path.basename(o.planilha[i]);
      const adj = Object.assign({}, ajustes[base] || (ajustes.cfg || ajustes.texts || ajustes.attLayout ? ajustes : {}));
      if (attRaw != null && o.planilha.length === 1) adj.attRaw = attRaw;
      const r = await page.evaluate(([i, a]) => window.__hurtz.apply(i, a), [i, adj]);
      resumos.push(r);
      if (!o.soResumo) {
        const url = await page.evaluate(([i, e]) => window.__hurtz.png(i, e), [i, o.escala]);
        const file = path.join(o.saida, `relatorio-${r.slug}-${r.fim || new Date().toISOString().slice(0, 10)}.png`);
        fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
        r.arquivo = file;
      }
    }
    console.log(JSON.stringify(resumos, null, 2));
  } finally {
    await browser.close(); server.close();
  }
})().catch(e => { console.error(e.message); process.exit(1); });

async function attText(file) {
  if (/\.(xlsx|xls)$/i.test(file)) {
    const X = require('./public/vendor/xlsx.full.min.js');
    const wb = X.readFile(file);
    return X.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { FS: '\t' });
  }
  return fs.readFileSync(file, 'utf8');
}
