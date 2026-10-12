import { Router } from 'express';
import { autenticar } from '../middleware/autenticacao.js';
import { garantirCarrinhoAtivo, lerCarrinho } from '../services/carrinhoService.js';
import { registrarRotasDeItens } from './itensCarrinho.js';

/**
 * Atalho de /api/carrinhos para o carrinho ATIVO. Mantido para quem ja
 * consumia o carrinho unico: os mesmos caminhos continuam funcionando, agora
 * apontando para o ativo. A API completa (varios carrinhos) e /api/carrinhos.
 */
export const rotasCarrinho = Router();

rotasCarrinho.use(autenticar);

rotasCarrinho.get('/', async (req, res) => {
  res.json({ dados: await lerCarrinho(req.usuario.id) });
});

registrarRotasDeItens(rotasCarrinho, (req) => garantirCarrinhoAtivo(req.usuario.id).id);
