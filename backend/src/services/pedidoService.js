import { obterBanco, agoraISO } from '../db/index.js';
import { ApiError } from '../lib/ApiError.js';
import { paraCentavos, paraReais } from '../lib/dinheiro.js';
import * as erp from '../erp/cliente.js';
import { buscarEndereco, serializarEndereco } from './enderecoService.js';
import {
  carrinhoParaFechar,
  encerrarCarrinhoFechado,
  lerCarrinhoPorId,
  liberarReserva,
  reservarParaFechamento,
} from './carrinhoService.js';

function enderecoEmUmaLinha(e) {
  const complemento = e.complemento ? `, ${e.complemento}` : '';
  return `${e.logradouro}, ${e.numero}${complemento} - ${e.bairro}, ${e.cidade}/${e.uf} - CEP ${e.cep}`;
}

/**
 * Fecha o pedido DE UM carrinho: o informado em `carrinhoId` ou, sem ele, o
 * ativo. Os demais carrinhos da pessoa nao sao tocados.
 *
 * O pedido de verdade nasce no ERP. A loja guarda so o vinculo
 * numero <-> usuario, porque o ERP conhece "Fulano, CPF X", nao "a conta
 * fulano@email.com". Sem esse vinculo nao daria para montar "meus pedidos".
 */
export async function finalizarPedido(usuario, enderecoId, observacao, carrinhoId = null, db = obterBanco()) {
  const enderecoLinha = buscarEndereco(usuario.id, enderecoId, db);
  if (!enderecoLinha) {
    throw ApiError.naoProcessavel('Nao foi possivel fechar o pedido.', [
      { campo: 'endereco_id', mensagem: 'Endereco de entrega nao encontrado.' },
    ]);
  }

  // 404 se o carrinho nao for desta pessoa.
  const alvo = carrinhoParaFechar(usuario.id, carrinhoId, db);

  // Trava o carrinho ate o pedido sair. Sem isso, dois "Confirmar" ao mesmo
  // tempo (clique duplo, duas abas) leriam o mesmo carrinho e criariam dois
  // pedidos no ERP, baixando o estoque duas vezes.
  reservarParaFechamento(usuario.id, alvo.id, db);

  let pedidoCriadoNoErp = false;

  try {
    const carrinho = await lerCarrinhoPorId(usuario.id, alvo.id, db);

    if (carrinho.itens.length === 0) {
      throw ApiError.conflito('CARRINHO_VAZIO', 'Seu carrinho esta vazio.');
    }

    if (!carrinho.pronto_para_checkout) {
      throw ApiError.conflito(
        'CARRINHO_COM_PENDENCIAS',
        'Alguns itens do carrinho precisam de ajuste antes de fechar o pedido.',
        carrinho.itens
          .filter((item) => !item.disponivel)
          .map((item) => ({ codigo_produto: item.codigo_produto, motivo: item.problema })),
      );
    }

    const endereco = serializarEndereco(enderecoLinha);

    // O ERP nao tem campo de endereco de entrega; vai na observacao, que e como
    // o SIAC recebe esse dado hoje. O nome do carrinho tambem: ajuda quem separa
    // o pedido no balcao ("Civic prata").
    const partesObservacao = [`Entrega: ${enderecoEmUmaLinha(endereco)}`];
    if (alvo.nome) partesObservacao.push(`Carrinho: ${alvo.nome}`);
    if (observacao) partesObservacao.push(`Obs. do cliente: ${observacao}`);

    const pedidoErp = await erp.criarPedido({
      cliente: { nome: usuario.nome, documento: usuario.documento },
      observacao: partesObservacao.join(' | ').slice(0, 500),
      itens: carrinho.itens.map((item) => ({
        codigo_produto: item.codigo_produto,
        quantidade: item.quantidade,
      })),
    });

    pedidoCriadoNoErp = true;

    /*
     * Daqui para baixo o estoque JA foi baixado no ERP. Se a gravacao local
     * falhar, o pedido existe mas nao aparece em "meus pedidos" - por isso o log
     * abaixo carrega o numero: da para reconciliar a mao. A reserva nao e
     * liberada nesse caso (expira sozinha em 1 min), para o cliente nao
     * reenviar o mesmo carrinho na hora e duplicar o pedido.
     * Resolver isso de verdade exigiria um outbox ou um endpoint de
     * cancelamento no ERP; esta anotado no README como evolucao.
     */
    try {
      db.transaction(() => {
        db.prepare(`
          INSERT INTO pedidos_usuario (
            usuario_id, numero_erp, endereco_entrega, valor_total_centavos, criado_em
          ) VALUES (?, ?, ?, ?, ?)
        `).run(
          usuario.id,
          pedidoErp.numero,
          JSON.stringify(endereco),
          paraCentavos(pedidoErp.valor_total),
          agoraISO(),
        );

        // So o carrinho que virou pedido sai de cena.
        encerrarCarrinhoFechado(usuario.id, alvo.id, db);
      })();
    } catch (erro) {
      console.error(
        `[pedido] ERP criou ${pedidoErp.numero} para o usuario ${usuario.id}, ` +
        'mas a gravacao local falhou. Reconciliar manualmente.',
        erro,
      );
      throw erro;
    }

    return { ...pedidoErp, endereco_entrega: endereco };
  } catch (erro) {
    // Falhou ANTES de existir pedido (vazio, pendencia, ERP recusou/fora do ar):
    // o carrinho volta a ser editavel imediatamente.
    if (!pedidoCriadoNoErp) liberarReserva(alvo.id, db);
    throw erro;
  }
}

/**
 * Lista os pedidos do usuario.
 *
 * Numero, valor e data vem do banco local; a situacao atual vem do ERP, que e
 * quem manda nisso. Sao N chamadas por pagina - com paginas de 10 e um
 * catalogo deste tamanho, compensa a simplicidade. Um volume maior pediria
 * cache ou um endpoint de consulta em lote no ERP.
 */
export async function listarPedidos(usuarioId, { pagina, tamanho }, db = obterBanco()) {
  const { total } = db
    .prepare('SELECT COUNT(*) AS total FROM pedidos_usuario WHERE usuario_id = ?')
    .get(usuarioId);

  const linhas = db
    .prepare(`
      SELECT * FROM pedidos_usuario
       WHERE usuario_id = ?
       ORDER BY id DESC
       LIMIT ? OFFSET ?
    `)
    .all(usuarioId, tamanho, (pagina - 1) * tamanho);

  const pedidos = await Promise.all(
    linhas.map(async (linha) => {
      const base = {
        numero: linha.numero_erp,
        valor_total: paraReais(linha.valor_total_centavos),
        criado_em: linha.criado_em,
        endereco_entrega: JSON.parse(linha.endereco_entrega),
      };

      try {
        const doErp = await erp.buscarPedido(linha.numero_erp);
        return {
          ...base,
          situacao: doErp?.situacao ?? 'INDISPONIVEL',
          quantidade_itens: doErp?.quantidade_itens ?? null,
        };
      } catch {
        // ERP fora do ar: mostra o que a loja sabe em vez de quebrar a pagina.
        return { ...base, situacao: 'INDISPONIVEL', quantidade_itens: null };
      }
    }),
  );

  return {
    pedidos,
    paginacao: {
      pagina,
      tamanho,
      total,
      total_paginas: Math.max(1, Math.ceil(total / tamanho)),
    },
  };
}

export async function buscarPedidoDoUsuario(usuarioId, numero, db = obterBanco()) {
  // Checa a posse ANTES de ir no ERP: trocar o numero na URL nao pode revelar
  // o pedido de outro cliente.
  const vinculo = db
    .prepare('SELECT * FROM pedidos_usuario WHERE usuario_id = ? AND UPPER(numero_erp) = ?')
    .get(usuarioId, String(numero).toUpperCase());

  if (!vinculo) {
    throw ApiError.naoEncontrado('Pedido nao encontrado.');
  }

  const pedido = await erp.buscarPedido(vinculo.numero_erp);

  if (!pedido) {
    throw ApiError.naoEncontrado('Pedido nao encontrado no sistema de estoque.');
  }

  return { ...pedido, endereco_entrega: JSON.parse(vinculo.endereco_entrega) };
}
