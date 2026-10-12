import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import Database from 'better-sqlite3';
import { aplicarSchema } from '../src/db/index.js';

/** Banco como era ANTES dos multiplos carrinhos: itens ligados ao usuario. */
function bancoLegado() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL, documento TEXT NOT NULL, telefone TEXT,
      criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL
    );
    CREATE TABLE carrinho_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
      codigo_produto TEXT NOT NULL,
      quantidade INTEGER NOT NULL CHECK (quantidade > 0),
      adicionado_em TEXT NOT NULL,
      UNIQUE (usuario_id, codigo_produto)
    );
    CREATE INDEX idx_carrinho_usuario ON carrinho_itens (usuario_id);
  `);
  const agora = '2026-01-01T10:00:00.000Z';
  for (const [i, email] of ['a@x.com', 'b@x.com', 'c@x.com'].entries()) {
    db.prepare('INSERT INTO usuarios (nome, email, senha_hash, documento, criado_em, atualizado_em) VALUES (?,?,?,?,?,?)')
      .run(`U${i}`, email, 'h', '12345678901', agora, agora);
  }
  const item = db.prepare('INSERT INTO carrinho_itens (usuario_id, codigo_produto, quantidade, adicionado_em) VALUES (?,?,?,?)');
  item.run(1, 'PEC-001', 3, '2026-01-01T10:00:00.000Z');
  item.run(1, 'PEC-002', 1, '2026-01-02T10:00:00.000Z');
  item.run(2, 'PEC-001', 5, '2026-01-03T10:00:00.000Z');
  // usuario 3 nunca teve item
  return db;
}

describe('migracao: carrinho unico -> varios carrinhos', () => {
  test('cada usuario com itens ganha "Meu carrinho" ativo com os mesmos itens', () => {
    const db = bancoLegado();
    aplicarSchema(db);

    const carrinhos = db.prepare('SELECT * FROM carrinhos ORDER BY usuario_id').all();
    assert.deepEqual(carrinhos.map((c) => [c.usuario_id, c.nome, c.ativo]), [
      [1, 'Meu carrinho', 1],
      [2, 'Meu carrinho', 1],
    ]);

    const itens = db.prepare(`
      SELECT c.usuario_id, i.codigo_produto, i.quantidade
        FROM carrinho_itens i JOIN carrinhos c ON c.id = i.carrinho_id
       ORDER BY c.usuario_id, i.codigo_produto
    `).all();
    assert.deepEqual(itens.map((i) => [i.usuario_id, i.codigo_produto, i.quantidade]), [
      [1, 'PEC-001', 3], [1, 'PEC-002', 1], [2, 'PEC-001', 5],
    ]);
  });

  test('a tabela legada nao sobra e rodar de novo nao muda nada (idempotente)', () => {
    const db = bancoLegado();
    aplicarSchema(db);
    const antes = db.prepare('SELECT COUNT(*) AS n FROM carrinho_itens').get().n;

    aplicarSchema(db);
    aplicarSchema(db);

    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM carrinho_itens').get().n, antes);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM carrinhos').get().n, 2);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'carrinho_itens_legado'").get().n,
      0,
    );
  });

  test('banco novo (sem legado) so cria o schema', () => {
    const db = new Database(':memory:');
    aplicarSchema(db);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM carrinhos').get().n, 0);
  });

  test('o banco garante no maximo um carrinho ativo por usuario', () => {
    const db = bancoLegado();
    aplicarSchema(db);
    const agora = new Date().toISOString();
    assert.throws(
      () => db.prepare("INSERT INTO carrinhos (usuario_id, nome, ativo, criado_em, atualizado_em) VALUES (1,'Outro',1,?,?)").run(agora, agora),
      /UNIQUE/,
    );
  });
});
