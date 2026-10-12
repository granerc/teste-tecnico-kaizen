import { ApiError } from '../lib/ApiError.js';
import { ColetorDeErros, exigirObjeto, inteiroPositivo, textoObrigatorio } from '../lib/validacao.js';
import {
  adicionarItem,
  alterarQuantidade,
  esvaziarCarrinho,
  lerCarrinho,
  MAXIMO_POR_ITEM,
  removerItem,
} from '../services/carrinhoService.js';

/**
 * Id vindo da URL. Texto que nao e um inteiro positivo nao pode ser um carrinho:
 * responde 404 (e nao 422), igual a um id que nao existe.
 */
export function lerIdDaRota(valor) {
  if (!/^[1-9]\d{0,9}$/.test(String(valor))) {
    throw ApiError.naoEncontrado('Carrinho nao encontrado.');
  }
  return Number(valor);
}

/**
 * Rotas de itens, iguais para os dois jeitos de chamar:
 *   /api/carrinhos/:id/itens   (carrinho explicito)
 *   /api/carrinho/itens        (atalho: o carrinho ativo)
 *
 * `obterCarrinhoId(req)` e o unico ponto que muda. Toda resposta devolve o
 * estado completo (conteudo do ativo + resumo de todos), entao o front troca o
 * estado inteiro a cada resposta, sem remendar pedacinhos.
 */
export function registrarRotasDeItens(router, obterCarrinhoId) {
  router.post('/itens', async (req, res) => {
    const corpo = exigirObjeto(req.body);
    const erros = new ColetorDeErros();

    const codigo = textoObrigatorio(corpo.codigo_produto, 'codigo_produto', erros, { min: 1, max: 40 });
    const quantidade = inteiroPositivo(corpo.quantidade ?? 1, 'quantidade', erros, { max: MAXIMO_POR_ITEM });

    erros.lancarSeInvalido('Nao foi possivel adicionar ao carrinho.');

    await adicionarItem(req.usuario.id, obterCarrinhoId(req), codigo, quantidade);
    res.status(201).json({ dados: await lerCarrinho(req.usuario.id) });
  });

  router.patch('/itens/:codigo', async (req, res) => {
    const corpo = exigirObjeto(req.body);
    const erros = new ColetorDeErros();

    const quantidade = inteiroPositivo(corpo.quantidade, 'quantidade', erros, { max: MAXIMO_POR_ITEM });

    erros.lancarSeInvalido('Quantidade invalida.');

    await alterarQuantidade(req.usuario.id, obterCarrinhoId(req), req.params.codigo, quantidade);
    res.json({ dados: await lerCarrinho(req.usuario.id) });
  });

  router.delete('/itens/:codigo', async (req, res) => {
    removerItem(req.usuario.id, obterCarrinhoId(req), req.params.codigo);
    res.json({ dados: await lerCarrinho(req.usuario.id) });
  });

  // Esvazia: tira os itens e mantem o carrinho (para apagar o carrinho em si,
  // DELETE /api/carrinhos/:id).
  router.delete('/itens', async (req, res) => {
    esvaziarCarrinho(req.usuario.id, obterCarrinhoId(req));
    res.json({ dados: await lerCarrinho(req.usuario.id) });
  });
}
