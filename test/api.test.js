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
const { app, lerEvento, lerItem } = require('../server');

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

test('compromissos de vários dias', () => {
  const { ok } = lerEvento({ titulo: 'Praia', data: '2026-11-20', dataFim: '2026-11-22', inicio: '18:00', fim: '09:00' });
  assert.strictEqual(ok.data_fim, '2026-11-22');
  assert.strictEqual(ok.inicio, '18:00'); // em vários dias o fim pode ser "antes" do início: é em outro dia
  assert.strictEqual(lerEvento({ titulo: 'X', data: '2026-11-20', dataFim: '2026-11-20' }).ok.data_fim, null);
  assert.ok(lerEvento({ titulo: 'X', data: '2026-11-20', dataFim: '2026-11-19' }).erro);
  assert.ok(lerEvento({ titulo: 'X', data: '2026-11-20', dataFim: '2028-01-01' }).erro);
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

test('férias de vários dias são salvas e editadas', async () => {
  const r = await ela('POST', '/api/eventos', { titulo: 'Férias', data: '2026-12-20', dataFim: '2027-01-03', diaTodo: true, quem: 'ambos' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.dados.dataFim, '2027-01-03');
  const ed = await ele('PUT', `/api/eventos/${r.dados.id}`, { ...r.dados, dataFim: '' });
  assert.strictEqual(ed.dados.dataFim, '');
  await ele('DELETE', `/api/eventos/${r.dados.id}`);
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

test('validação dos itens de compra', () => {
  assert.ok(lerItem({ quantidade: 2 }).erro);
  assert.ok(lerItem({ nome: 'Arroz', quantidade: '0' }).erro);
  assert.ok(lerItem({ nome: 'Arroz', quantidade: 'muito' }).erro);
  const { ok } = lerItem({ nome: '  queijo  ', quantidade: '1,5', unidade: 'kg', categoria: 'Frios e laticínios' });
  assert.deepStrictEqual([ok.nome, ok.quantidade, ok.unidade, ok.categoria], ['Queijo', 1.5, 'kg', 'Frios e laticínios']);
  const padrao = lerItem({ nome: 'Pão', unidade: 'tonelada', categoria: 'Joias' }).ok;
  assert.deepStrictEqual([padrao.quantidade, padrao.unidade, padrao.categoria], [1, 'un', 'Outros']);
});

test('lista de compras compartilhada', async () => {
  assert.strictEqual((await cliente()('GET', '/api/compras')).status, 401);
  const arroz = await ele('POST', '/api/compras', { nome: 'Arroz', quantidade: 2, unidade: 'kg', categoria: 'Mercearia' });
  assert.strictEqual(arroz.status, 201);
  await ela('POST', '/api/compras', { nome: 'Leite', quantidade: 6, unidade: 'L', categoria: 'Frios e laticínios' });

  // Pedir de novo o mesmo item soma a quantidade.
  const de_novo = await ela('POST', '/api/compras', { nome: 'arroz', quantidade: 1, unidade: 'kg' });
  assert.strictEqual(de_novo.dados.somado, true);
  assert.strictEqual(de_novo.dados.quantidade, 3);

  let d = (await ele('GET', '/api/compras')).dados;
  assert.deepStrictEqual(d.itens.map((i) => i.nome).sort(), ['Arroz', 'Leite']);
  assert.ok(d.categorias.includes('Hortifrúti'));
  assert.ok(d.sugestoes.some((s) => s.nome === 'Arroz' && s.unidade === 'kg'));

  // Ela pega o arroz; ele vê no carrinho.
  const pego = await ela('POST', `/api/compras/${arroz.dados.id}/comprado`, { comprado: true });
  assert.strictEqual(pego.dados.comprado, true);
  d = (await ele('GET', '/api/compras')).dados;
  assert.strictEqual(d.itens.find((i) => i.nome === 'Arroz').comprado, true);

  // Item já no carrinho não recebe soma: entra de novo na lista.
  const outro = await ele('POST', '/api/compras', { nome: 'Arroz', quantidade: 1, unidade: 'kg' });
  assert.strictEqual(outro.status, 201);

  const ed = await ele('PUT', `/api/compras/${outro.dados.id}`, { nome: 'Arroz integral', quantidade: '1', unidade: 'pct', categoria: 'Mercearia', obs: 'tipo 1' });
  assert.deepStrictEqual([ed.dados.nome, ed.dados.unidade, ed.dados.obs], ['Arroz integral', 'pct', 'tipo 1']);

  const limpo = await ele('POST', '/api/compras/limpar');
  assert.strictEqual(limpo.dados.removidos, 1);
  d = (await ela('GET', '/api/compras')).dados;
  assert.deepStrictEqual(d.itens.map((i) => i.nome).sort(), ['Arroz integral', 'Leite']);

  assert.strictEqual((await ela('DELETE', `/api/compras/${outro.dados.id}`)).status, 200);
  assert.strictEqual((await ela('DELETE', `/api/compras/${outro.dados.id}`)).status, 404);
  // O que já foi comprado continua como sugestão.
  assert.ok((await ela('GET', '/api/compras')).dados.sugestoes.some((s) => s.nome === 'Arroz'));
});

test('app instalável: manifesto, service worker e ícones', async () => {
  const anon = cliente();
  const m = await anon('GET', '/manifest.webmanifest');
  assert.strictEqual(m.status, 200);
  const manifesto = typeof m.dados === 'string' ? JSON.parse(m.dados) : m.dados;
  assert.strictEqual(manifesto.display, 'standalone');
  for (const i of manifesto.icons) assert.strictEqual((await anon('GET', i.src)).status, 200);
  assert.strictEqual((await anon('GET', '/sw.js')).status, 200);
  assert.strictEqual((await anon('GET', '/js/compras.js')).status, 200);
  assert.ok(manifesto.shortcuts.some((a) => a.url === '/#compras'));
  assert.strictEqual((await anon('GET', '/icons/apple-touch-icon.png')).status, 200);
  assert.strictEqual((await anon('GET', '/healthz')).dados, 'ok');
});
