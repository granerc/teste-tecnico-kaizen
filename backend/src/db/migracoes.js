/**
 * Migracoes do schema.
 *
 * O schema.sql usa CREATE TABLE IF NOT EXISTS, que nao altera uma tabela que ja
 * existe. Quando a forma de uma tabela muda, quem ja tem banco precisa de um
 * passo a mais. Cada migracao aqui e idempotente: se o banco ja esta no formato
 * novo, nao faz nada.
 */

// Nome do carrinho criado sozinho quando a pessoa ainda nao tem nenhum.
export const NOME_CARRINHO_PADRAO = 'Meu carrinho';

/**
 * Carrinho unico -> varios carrinhos.
 *
 * Antes, carrinho_itens apontava direto para o usuario. Agora aponta para um
 * carrinho. Em duas etapas porque o schema.sql precisa rodar no meio:
 *
 *   1. prepararMigracaoCarrinhos: se a tabela esta no formato antigo, renomeia
 *      para carrinho_itens_legado (libera o nome para a tabela nova)
 *   2. schema.sql cria carrinhos e a carrinho_itens nova
 *   3. concluirMigracaoCarrinhos: cada usuario com itens ganha um carrinho
 *      ativo "Meu carrinho" com os itens que ja tinha; descarta a legada
 *
 * Quem nao tinha item nenhum nao recebe nada aqui: o carrinho padrao nasce
 * sob demanda, na primeira leitura.
 *
 * Retorna true quando ha o que concluir.
 */
export function prepararMigracaoCarrinhos(db) {
  const colunas = db.prepare('PRAGMA table_info(carrinho_itens)').all();

  const existe = colunas.length > 0;
  const formatoAntigo = colunas.some((coluna) => coluna.name === 'usuario_id');

  if (!existe || !formatoAntigo) return false;

  db.exec(`
    DROP INDEX IF EXISTS idx_carrinho_usuario;
    ALTER TABLE carrinho_itens RENAME TO carrinho_itens_legado;
  `);

  return true;
}

export function concluirMigracaoCarrinhos(db) {
  db.exec(`
    INSERT INTO carrinhos (usuario_id, nome, ativo, criado_em, atualizado_em)
    SELECT usuario_id, '${NOME_CARRINHO_PADRAO}', 1, MIN(adicionado_em), MAX(adicionado_em)
      FROM carrinho_itens_legado
     GROUP BY usuario_id;

    INSERT INTO carrinho_itens (carrinho_id, codigo_produto, quantidade, adicionado_em)
    SELECT c.id, l.codigo_produto, l.quantidade, l.adicionado_em
      FROM carrinho_itens_legado l
      JOIN carrinhos c ON c.usuario_id = l.usuario_id;

    DROP TABLE carrinho_itens_legado;
  `);
}
