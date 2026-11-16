// Agenda da Família · servidor HTTP
// Login das duas pessoas da casa, compromissos (com repetição e vários dias), lista de compras e o aplicativo instalável (PWA).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { db, DATA_DIR, hashSenha, conferirSenha } = require('./db');

const PORT = Number(process.env.PORT) || 3000;
const PRODUCAO = process.env.NODE_ENV === 'production';

const SECRET_FILE = path.join(DATA_DIR, '.session-secret');
const SESSION_SECRET = process.env.SESSION_SECRET || (() => {
  if (!fs.existsSync(SECRET_FILE)) fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString('hex'));
  return fs.readFileSync(SECRET_FILE, 'utf8');
})();

// Primeiro acesso: cria as duas contas a partir das variáveis de ambiente.
const PESSOAS_PADRAO = { a: { login: 'marido', nome: 'Marido' }, b: { login: 'esposa', nome: 'Esposa' } };
for (const [pessoa, n] of [['a', 1], ['b', 2]]) {
  if (db.prepare('SELECT 1 FROM usuarios WHERE pessoa = ?').get(pessoa)) continue;
  const login = process.env[`LOGIN_${n}`] || PESSOAS_PADRAO[pessoa].login;
  const nome = process.env[`NOME_${n}`] || PESSOAS_PADRAO[pessoa].nome;
  const senha = process.env[`SENHA_${n}`] || (PRODUCAO ? null : 'agenda123');
  if (!senha) {
    console.error(`[erro] Em produção defina SENHA_${n} para criar a conta ${n}.`);
    process.exit(1);
  }
  db.prepare('INSERT INTO usuarios (nome, login, senha_hash, pessoa) VALUES (?, ?, ?, ?)').run(nome, login, hashSenha(senha), pessoa);
  console.log(`[info] Conta ${n} criada: login "${login}"${process.env[`SENHA_${n}`] ? '' : ' / senha "agenda123" (troque no primeiro acesso)'}.`);
}

// ---------- sessão ----------
function assinar(payload) {
  const corpo = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(corpo).digest('base64url');
  return `${corpo}.${sig}`;
}

function verificar(token) {
  if (!token) return null;
  const [corpo, sig] = token.split('.');
  if (!corpo || !sig) return null;
  const esperado = crypto.createHmac('sha256', SESSION_SECRET).update(corpo).digest('base64url');
  if (sig.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado))) return null;
  try {
    const payload = JSON.parse(Buffer.from(corpo, 'base64url').toString());
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function lerCookies(req) {
  const out = {};
  for (const parte of (req.headers.cookie || '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0) out[parte.slice(0, i).trim()] = decodeURIComponent(parte.slice(i + 1).trim());
  }
  return out;
}

// No celular o app fica conectado: 180 dias, renovados a cada uso.
const DIAS_SESSAO = 180;
function definirSessao(res, usuario) {
  const ms = DIAS_SESSAO * 864e5;
  const token = assinar({ uid: usuario.id, v: usuario.senha_hash.slice(-12), exp: Date.now() + ms });
  res.cookie('sess_agenda', token, { httpOnly: true, sameSite: 'lax', maxAge: ms, secure: PRODUCAO });
}

function exigirLogin(req, res, next) {
  const s = verificar(lerCookies(req).sess_agenda);
  const u = s && db.prepare('SELECT * FROM usuarios WHERE id = ?').get(s.uid);
  // A sessão cai quando a senha é trocada (v = final do hash).
  if (!u || u.senha_hash.slice(-12) !== s.v) return res.status(401).json({ erro: 'Sessão expirada. Entre novamente.' });
  req.usuario = u;
  // Renova a sessão quando passou da metade do prazo.
  if (s.exp - Date.now() < (DIAS_SESSAO / 2) * 864e5) definirSessao(res, u);
  next();
}

// ---------- validação ----------
const texto = (v, max = 300) => {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};
const textoLongo = (v, max = 1000) => {
  const t = String(v ?? '').replace(/\r/g, '').trim();
  return t ? t.slice(0, max) : null;
};
const dataValida = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(Date.parse(v)) ? v : null);
const horaValida = (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? v : null);

function lerEvento(corpo = {}) {
  const titulo = texto(corpo.titulo, 120);
  const data = dataValida(corpo.data);
  if (!titulo) return { erro: 'Informe o que é o compromisso.' };
  if (!data) return { erro: 'Informe uma data válida.' };
  let dataFim = corpo.dataFim ? dataValida(corpo.dataFim) : null;
  if (corpo.dataFim && !dataFim) return { erro: 'Informe uma data final válida.' };
  if (dataFim && dataFim < data) return { erro: 'A data final é antes da data inicial.' };
  if (dataFim === data) dataFim = null;
  if (dataFim && (Date.parse(dataFim) - Date.parse(data)) / 864e5 > 366) return { erro: 'Um compromisso pode durar no máximo um ano.' };
  const diaTodo = corpo.diaTodo ? 1 : 0;
  const inicio = diaTodo ? null : horaValida(corpo.inicio);
  const fim = diaTodo ? null : horaValida(corpo.fim);
  if (!dataFim && inicio && fim && fim < inicio) return { erro: 'O horário de fim é antes do início.' };
  const quem = ['a', 'b', 'ambos'].includes(corpo.quem) ? corpo.quem : 'ambos';
  const repetir = ['nao', 'semanal', 'mensal', 'anual'].includes(corpo.repetir) ? corpo.repetir : 'nao';
  return { ok: { titulo, data, data_fim: dataFim, dia_todo: diaTodo, inicio, fim, quem, local: texto(corpo.local, 120), notas: textoLongo(corpo.notas), repetir } };
}

const paraCliente = (e) => ({
  id: e.id, titulo: e.titulo, data: e.data, dataFim: e.data_fim || '', diaTodo: !!e.dia_todo, inicio: e.inicio || '', fim: e.fim || '',
  quem: e.quem, local: e.local || '', notas: e.notas || '', repetir: e.repetir,
  criadoPor: e.criado_por, atualizadoEm: e.atualizado_em,
});

function nomes() {
  const out = { a: PESSOAS_PADRAO.a.nome, b: PESSOAS_PADRAO.b.nome };
  for (const u of db.prepare('SELECT pessoa, nome FROM usuarios').all()) out[u.pessoa] = u.nome;
  return out;
}

// ---------- app ----------
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.get('/healthz', (req, res) => res.send('ok'));

const falhas = new Map(); // ip -> { n, ate }
app.post('/api/login', (req, res) => {
  const ip = req.ip || '';
  const f = falhas.get(ip);
  if (f && f.n >= 8 && f.ate > Date.now()) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde alguns minutos.' });
  const login = texto(req.body?.login, 80);
  const u = login && db.prepare('SELECT * FROM usuarios WHERE login = ?').get(login);
  if (!u || !conferirSenha(req.body?.senha || '', u.senha_hash)) {
    const atual = f && f.ate > Date.now() ? f : { n: 0 };
    falhas.set(ip, { n: atual.n + 1, ate: Date.now() + 10 * 60e3 });
    return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });
  }
  falhas.delete(ip);
  db.prepare("UPDATE usuarios SET ultimo_acesso = datetime('now') WHERE id = ?").run(u.id);
  definirSessao(res, u);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('sess_agenda');
  res.json({ ok: true });
});

app.get('/api/eu', exigirLogin, (req, res) => {
  const { id, nome, login, pessoa } = req.usuario;
  res.json({ id, nome, login, pessoa, nomes: nomes(), senhaPadrao: conferirSenha('agenda123', req.usuario.senha_hash) });
});

app.post('/api/eu/senha', exigirLogin, (req, res) => {
  const { atual, nova } = req.body || {};
  if (!conferirSenha(atual || '', req.usuario.senha_hash)) return res.status(400).json({ erro: 'A senha atual não confere.' });
  if (String(nova || '').length < 6) return res.status(400).json({ erro: 'A nova senha precisa ter pelo menos 6 caracteres.' });
  const hash = hashSenha(nova);
  db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(hash, req.usuario.id);
  definirSessao(res, { ...req.usuario, senha_hash: hash });
  res.json({ ok: true });
});

app.put('/api/nomes', exigirLogin, (req, res) => {
  const a = texto(req.body?.a, 30), b = texto(req.body?.b, 30);
  if (!a || !b) return res.status(400).json({ erro: 'Informe os dois nomes.' });
  db.prepare("UPDATE usuarios SET nome = ? WHERE pessoa = 'a'").run(a);
  db.prepare("UPDATE usuarios SET nome = ? WHERE pessoa = 'b'").run(b);
  res.json(nomes());
});

app.get('/api/eventos', exigirLogin, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(db.prepare('SELECT * FROM eventos ORDER BY data, inicio').all().map(paraCliente));
});

app.post('/api/eventos', exigirLogin, (req, res) => {
  const { ok, erro } = lerEvento(req.body);
  if (erro) return res.status(400).json({ erro });
  const r = db.prepare(`INSERT INTO eventos (titulo, data, data_fim, dia_todo, inicio, fim, quem, local, notas, repetir, criado_por)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(ok.titulo, ok.data, ok.data_fim, ok.dia_todo, ok.inicio, ok.fim, ok.quem, ok.local, ok.notas, ok.repetir, req.usuario.id);
  res.status(201).json(paraCliente(db.prepare('SELECT * FROM eventos WHERE id = ?').get(r.lastInsertRowid)));
});

app.put('/api/eventos/:id', exigirLogin, (req, res) => {
  const atual = db.prepare('SELECT * FROM eventos WHERE id = ?').get(Number(req.params.id));
  if (!atual) return res.status(404).json({ erro: 'Compromisso não encontrado. Talvez já tenha sido excluído.' });
  const { ok, erro } = lerEvento(req.body);
  if (erro) return res.status(400).json({ erro });
  db.prepare(`UPDATE eventos SET titulo = ?, data = ?, data_fim = ?, dia_todo = ?, inicio = ?, fim = ?, quem = ?, local = ?, notas = ?, repetir = ?,
    atualizado_em = datetime('now') WHERE id = ?`).run(ok.titulo, ok.data, ok.data_fim, ok.dia_todo, ok.inicio, ok.fim, ok.quem, ok.local, ok.notas, ok.repetir, atual.id);
  res.json(paraCliente(db.prepare('SELECT * FROM eventos WHERE id = ?').get(atual.id)));
});

app.delete('/api/eventos/:id', exigirLogin, (req, res) => {
  const r = db.prepare('DELETE FROM eventos WHERE id = ?').run(Number(req.params.id));
  if (!r.changes) return res.status(404).json({ erro: 'Compromisso não encontrado.' });
  res.json({ ok: true });
});

// ---------- lista de compras ----------
const CATEGORIAS = ['Hortifrúti', 'Açougue e peixaria', 'Padaria', 'Frios e laticínios', 'Mercearia', 'Bebidas',
  'Congelados', 'Limpeza', 'Higiene', 'Farmácia', 'Pet', 'Outros'];
const UNIDADES = ['un', 'kg', 'g', 'L', 'ml', 'pct', 'cx', 'dz', 'lata', 'garrafa'];

/** Quantidade em formato brasileiro ("1,5") ou número. */
function quantidade(v) {
  if (v === undefined || v === null || v === '') return 1;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n <= 9999 ? Math.round(n * 1000) / 1000 : null;
}

function lerItem(corpo = {}) {
  const nome = texto(corpo.nome, 80);
  if (!nome) return { erro: 'Informe o item.' };
  const qtd = quantidade(corpo.quantidade);
  if (qtd === null) return { erro: 'Informe uma quantidade entre 0 e 9999.' };
  return { ok: {
    nome: nome.charAt(0).toUpperCase() + nome.slice(1), quantidade: qtd,
    unidade: UNIDADES.includes(corpo.unidade) ? corpo.unidade : 'un',
    categoria: CATEGORIAS.includes(corpo.categoria) ? corpo.categoria : 'Outros',
    obs: texto(corpo.obs, 200),
  } };
}

const itemParaCliente = (i) => ({
  id: i.id, nome: i.nome, quantidade: i.quantidade, unidade: i.unidade, categoria: i.categoria, obs: i.obs || '',
  comprado: !!i.comprado, criadoPor: i.criado_por, compradoPor: i.comprado_por, atualizadoEm: i.atualizado_em,
});
const lerItemDb = (id) => db.prepare('SELECT * FROM compras WHERE id = ?').get(id);

function lembrar(item) {
  db.prepare(`INSERT INTO compras_historico (nome, unidade, categoria) VALUES (?, ?, ?)
    ON CONFLICT(nome) DO UPDATE SET unidade = excluded.unidade, categoria = excluded.categoria, usos = usos + 1, ultimo = datetime('now')`)
    .run(item.nome, item.unidade, item.categoria);
}

app.get('/api/compras', exigirLogin, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    itens: db.prepare('SELECT * FROM compras ORDER BY comprado, categoria, nome COLLATE NOCASE').all().map(itemParaCliente),
    sugestoes: db.prepare('SELECT nome, unidade, categoria FROM compras_historico ORDER BY usos DESC, ultimo DESC LIMIT 300').all(),
    categorias: CATEGORIAS, unidades: UNIDADES,
  });
});

app.post('/api/compras', exigirLogin, (req, res) => {
  const { ok, erro } = lerItem(req.body);
  if (erro) return res.status(400).json({ erro });
  lembrar(ok);
  // Se o item já está na lista (ainda não comprado, mesma unidade), soma a quantidade.
  const igual = db.prepare('SELECT * FROM compras WHERE nome = ? COLLATE NOCASE AND unidade = ? AND comprado = 0').get(ok.nome, ok.unidade);
  if (igual) {
    db.prepare("UPDATE compras SET quantidade = MIN(quantidade + ?, 9999), atualizado_em = datetime('now') WHERE id = ?").run(ok.quantidade, igual.id);
    return res.json({ ...itemParaCliente(lerItemDb(igual.id)), somado: true });
  }
  const r = db.prepare('INSERT INTO compras (nome, quantidade, unidade, categoria, obs, criado_por) VALUES (?, ?, ?, ?, ?, ?)')
    .run(ok.nome, ok.quantidade, ok.unidade, ok.categoria, ok.obs, req.usuario.id);
  res.status(201).json(itemParaCliente(lerItemDb(r.lastInsertRowid)));
});

app.put('/api/compras/:id', exigirLogin, (req, res) => {
  const atual = lerItemDb(Number(req.params.id));
  if (!atual) return res.status(404).json({ erro: 'Item não encontrado. Talvez já tenha saído da lista.' });
  const { ok, erro } = lerItem(req.body);
  if (erro) return res.status(400).json({ erro });
  lembrar(ok);
  db.prepare("UPDATE compras SET nome = ?, quantidade = ?, unidade = ?, categoria = ?, obs = ?, atualizado_em = datetime('now') WHERE id = ?")
    .run(ok.nome, ok.quantidade, ok.unidade, ok.categoria, ok.obs, atual.id);
  res.json(itemParaCliente(lerItemDb(atual.id)));
});

// Marca/desmarca "no carrinho".
app.post('/api/compras/:id/comprado', exigirLogin, (req, res) => {
  const atual = lerItemDb(Number(req.params.id));
  if (!atual) return res.status(404).json({ erro: 'Item não encontrado. Talvez já tenha saído da lista.' });
  const comprado = req.body?.comprado ? 1 : 0;
  db.prepare("UPDATE compras SET comprado = ?, comprado_por = ?, atualizado_em = datetime('now') WHERE id = ?")
    .run(comprado, comprado ? req.usuario.id : null, atual.id);
  res.json(itemParaCliente(lerItemDb(atual.id)));
});

app.delete('/api/compras/:id', exigirLogin, (req, res) => {
  const r = db.prepare('DELETE FROM compras WHERE id = ?').run(Number(req.params.id));
  if (!r.changes) return res.status(404).json({ erro: 'Item não encontrado.' });
  res.json({ ok: true });
});

// Tira da lista tudo o que já está no carrinho.
app.post('/api/compras/limpar', exigirLogin, (req, res) => {
  const r = db.prepare('DELETE FROM compras WHERE comprado = 1').run();
  res.json({ removidos: Number(r.changes) });
});

app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

// O shell do app e o service worker nunca ficam presos em cache do navegador.
app.get(['/', '/index.html', '/sw.js', '/manifest.webmanifest'], (req, res, next) => { res.setHeader('Cache-Control', 'no-cache'); next(); });
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ erro: err.type === 'entity.too.large' ? 'Conteúdo grande demais.' : 'Erro interno. Tente novamente.' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Agenda da Família rodando em http://localhost:${PORT}`));
}

module.exports = { app, lerEvento, lerItem };
