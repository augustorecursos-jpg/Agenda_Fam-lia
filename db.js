// Banco de dados SQLite (módulo nativo node:sqlite, sem dependências nativas).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'agenda.db');

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
-- As duas pessoas da casa. "pessoa" é a cor/coluna na agenda: a (azul) ou b (ciano).
CREATE TABLE IF NOT EXISTS usuarios (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nome       TEXT NOT NULL,
  login      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash TEXT NOT NULL,
  pessoa     TEXT NOT NULL UNIQUE CHECK (pessoa IN ('a', 'b')),
  ultimo_acesso TEXT,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS eventos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo      TEXT NOT NULL,
  data        TEXT NOT NULL,              -- AAAA-MM-DD (primeira ocorrência)
  dia_todo    INTEGER NOT NULL DEFAULT 0,
  inicio      TEXT,                       -- HH:MM
  fim         TEXT,                       -- HH:MM
  quem        TEXT NOT NULL DEFAULT 'ambos' CHECK (quem IN ('a', 'b', 'ambos')),
  local       TEXT,
  notas       TEXT,
  repetir     TEXT NOT NULL DEFAULT 'nao' CHECK (repetir IN ('nao', 'semanal', 'mensal', 'anual')),
  criado_por  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS eventos_data ON eventos (data);
`);

function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(senha), sal, 64);
  return `scrypt$${sal.toString('hex')}$${h.toString('hex')}`;
}

function conferirSenha(senha, armazenado) {
  const [tipo, salHex, hHex] = String(armazenado || '').split('$');
  if (tipo !== 'scrypt' || !salHex || !hHex) return false;
  const h = crypto.scryptSync(String(senha), Buffer.from(salHex, 'hex'), 64);
  const esperado = Buffer.from(hHex, 'hex');
  return esperado.length === h.length && crypto.timingSafeEqual(h, esperado);
}

module.exports = { db, DATA_DIR, DB_FILE, hashSenha, conferirSenha };
