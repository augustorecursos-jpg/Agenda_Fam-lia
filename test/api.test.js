// Testes da API: login das duas contas, compromissos, nomes, senha e o app instalável.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'agenda-teste-'));
process.env.SENHA_1 = 'senha-um';
process.env.SENHA_2 = 'senha-dois';
process.env.LOGIN_2 = 'ela';
const { app, lerEvento } = require('../server');

let servidor, base;
before(() => new Promise((ok) => { servidor = app.listen(0, () => { base = `http://localhost:${servidor.address().port}`; ok(); }); }));
after(() => { servidor.close(); fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true }); });

function cliente() {
  let cookie = '';
  return async (metodo, url, corpo) => {
    const r = await fetch(base + url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', cookie },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const c = r.headers.get('set-cookie');
    if (c) cookie = c.split(';')[0];
    const tipo = r.headers.get('content-type') || '';
    return { status: r.status, dados: tipo.includes('json') ? await r.json() : await r.text() };
  };
}
const ele = cliente();
const ela = cliente();

test('validação dos compromissos', () => {
  assert.ok(lerEvento({ data: '2026-11-20' }).erro);
  assert.ok(lerEvento({ titulo: 'X', data: '20/11/2026' }).erro);
  assert.ok(lerEvento({ titulo: 'X', data: '2026-11-20', inicio: '10:00', fim: '09:00' }).erro);
  const { ok } = lerEvento({ titulo: '  Jantar  ', data: '2026-11-20', diaTodo: true, inicio: '20:00', quem: 'x', repetir: 'y' });
  assert.deepStrictEqual([ok.titulo, ok.dia_todo, ok.inicio, ok.quem, ok.repetir], ['Jantar', 1, null, 'ambos', 'nao']);
});

test('rotas exigem login', async () => {
  const anon = cliente();
  assert.strictEqual((await anon('GET', '/api/eventos')).status, 401);
  assert.strictEqual((await anon('POST', '/api/eventos', { titulo: 'X', data: '2026-11-20' })).status, 401);
});

test('as duas contas entram', async () => {
  assert.strictEqual((await ele('POST', '/api/login', { login: 'marido', senha: 'errada' })).status, 401);
  assert.strictEqual((await ele('POST', '/api/login', { login: 'marido', senha: 'senha-um' })).status, 200);
  assert.strictEqual((await ela('POST', '/api/login', { login: 'ela', senha: 'senha-dois' })).status, 200);
  const eu = (await ela('GET', '/api/eu')).dados;
  assert.strictEqual(eu.pessoa, 'b');
  assert.strictEqual(eu.senhaPadrao, false);
});

test('o que um marca o outro vê, edita e exclui', async () => {
  const r = await ele('POST', '/api/eventos', { titulo: 'Dentista', data: '2026-11-18', inicio: '14:00', fim: '15:00', quem: 'a', local: 'Centro' });
  assert.strictEqual(r.status, 201);
  const id = r.dados.id;
  const lista = (await ela('GET', '/api/eventos')).dados;
  assert.deepStrictEqual(lista.map((e) => e.titulo), ['Dentista']);

  const ed = await ela('PUT', `/api/eventos/${id}`, { ...lista[0], titulo: 'Dentista (remarcado)', data: '2026-11-19', repetir: 'mensal' });
  assert.strictEqual(ed.status, 200);
  assert.strictEqual(ed.dados.repetir, 'mensal');
  assert.strictEqual((await ele('GET', '/api/eventos')).dados[0].titulo, 'Dentista (remarcado)');

  assert.strictEqual((await ela('DELETE', `/api/eventos/${id}`)).status, 200);
  assert.strictEqual((await ele('DELETE', `/api/eventos/${id}`)).status, 404);
  assert.strictEqual((await ele('GET', '/api/eventos')).dados.length, 0);
});

test('nomes do casal', async () => {
  const r = await ele('PUT', '/api/nomes', { a: 'Augusto', b: 'Maria' });
  assert.deepStrictEqual(r.dados, { a: 'Augusto', b: 'Maria' });
  assert.deepStrictEqual((await ela('GET', '/api/eu')).dados.nomes, { a: 'Augusto', b: 'Maria' });
  assert.strictEqual((await ele('PUT', '/api/nomes', { a: '', b: 'Maria' })).status, 400);
});

test('troca de senha derruba a sessão antiga', async () => {
  const outroAparelho = cliente();
  await outroAparelho('POST', '/api/login', { login: 'ela', senha: 'senha-dois' });
  assert.strictEqual((await ela('POST', '/api/eu/senha', { atual: 'errada', nova: 'nova-senha' })).status, 400);
  assert.strictEqual((await ela('POST', '/api/eu/senha', { atual: 'senha-dois', nova: '123' })).status, 400);
  assert.strictEqual((await ela('POST', '/api/eu/senha', { atual: 'senha-dois', nova: 'nova-senha' })).status, 200);
  assert.strictEqual((await ela('GET', '/api/eventos')).status, 200);
  assert.strictEqual((await outroAparelho('GET', '/api/eventos')).status, 401);
});

test('app instalável: manifesto, service worker e ícones', async () => {
  const anon = cliente();
  const m = await anon('GET', '/manifest.webmanifest');
  assert.strictEqual(m.status, 200);
  const manifesto = typeof m.dados === 'string' ? JSON.parse(m.dados) : m.dados;
  assert.strictEqual(manifesto.display, 'standalone');
  for (const i of manifesto.icons) assert.strictEqual((await anon('GET', i.src)).status, 200);
  assert.strictEqual((await anon('GET', '/sw.js')).status, 200);
  assert.strictEqual((await anon('GET', '/icons/apple-touch-icon.png')).status, 200);
  assert.strictEqual((await anon('GET', '/healthz')).dados, 'ok');
});
