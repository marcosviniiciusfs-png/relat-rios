import { json } from '../_lib/auth.mjs';

const RAIZ = 'Relatórios Semanais';

async function token(env) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: env.GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token' }),
  });
  const t = await r.json();
  if (!t.access_token) throw new Error('Google: ' + (t.error_description || t.error));
  return t.access_token;
}
async function api(tk, url, opts = {}) {
  const r = await fetch(url, Object.assign({}, opts, { headers: Object.assign({ Authorization: 'Bearer ' + tk }, opts.headers || {}) }));
  const j = await r.json();
  if (j.error) throw new Error('Drive: ' + j.error.message);
  return j;
}
const aspas = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
async function pasta(tk, nome, parent) {
  const q = `name='${aspas(nome)}' and mimeType='application/vnd.google-apps.folder' and trashed=false` + (parent ? ` and '${parent}' in parents` : '');
  const f = await api(tk, 'https://www.googleapis.com/drive/v3/files?fields=files(id,webViewLink)&q=' + encodeURIComponent(q));
  if (f.files.length) return f.files[0];
  return api(tk, 'https://www.googleapis.com/drive/v3/files?fields=id,webViewLink', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nome, mimeType: 'application/vnd.google-apps.folder', parents: parent ? [parent] : undefined }),
  });
}

export async function onRequestPost({ request, env }) {
  const u = new URL(request.url);
  const sub = u.searchParams.get('pasta') || '', nome = u.searchParams.get('nome') || '';
  if (!/^[\w .\-]{3,80}$/.test(sub) || !/^[\w.\-]{3,120}\.png$/i.test(nome)) return json({ erro: 'Nome inválido' }, 400);
  const png = await request.arrayBuffer();
  if (!png.byteLength || png.byteLength > 12e6) return json({ erro: 'Arquivo inválido' }, 400);
  try {
    const tk = await token(env);
    const raiz = await pasta(tk, RAIZ);
    const semana = await pasta(tk, sub, raiz.id);
    const q = `name='${aspas(nome)}' and '${semana.id}' in parents and trashed=false`;
    const ex = await api(tk, 'https://www.googleapis.com/drive/v3/files?fields=files(id)&q=' + encodeURIComponent(q));
    let f;
    if (ex.files.length) {
      f = await api(tk, `https://www.googleapis.com/upload/drive/v3/files/${ex.files[0].id}?uploadType=media&fields=id,webViewLink`, { method: 'PATCH', headers: { 'Content-Type': 'image/png' }, body: png });
    } else {
      const b = 'hz' + Date.now();
      const enc = new TextEncoder();
      const head = enc.encode(`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: nome, parents: [semana.id] })}\r\n--${b}\r\nContent-Type: image/png\r\n\r\n`);
      const tail = enc.encode(`\r\n--${b}--`);
      const body = new Uint8Array(head.length + png.byteLength + tail.length);
      body.set(head); body.set(new Uint8Array(png), head.length); body.set(tail, head.length + png.byteLength);
      f = await api(tk, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body });
    }
    return json({ ok: true, arquivo: f.webViewLink, pasta: semana.webViewLink });
  } catch (e) { return json({ erro: e.message }, 502); }
}
