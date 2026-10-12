import { Router } from 'express';
import { autenticar } from '../middleware/autenticacao.js';
import {
  ativarCarrinho,
  criarCarrinho,
  excluirCarrinho,
  lerCarrinho,
  lerCarrinhoPorId,
  renomearCarrinho,
} from '../services/carrinhoService.js';
import { ColetorDeErros, exigirObjeto, textoObrigatorio } from '../lib/validacao.js';
import { lerIdDaRota, registrarRotasDeItens } from './itensCarrinho.js';

export const rotasCarrinhos = Router();

rotasCarrinhos.use(autenticar);

const TAMANHO_MAXIMO_NOME = 40;

function lerNome(corpo) {
  const erros = new ColetorDeErros();
  const nome = textoObrigatorio(corpo.nome, 'nome', erros, { min: 1, max: TAMANHO_MAXIMO_NOME });
  erros.lancarSeInvalido('Nome de carrinho invalido.');
  return nome;
}

/** Estado do app: conteudo do carrinho ativo + resumo de todos os carrinhos. */
rotasCarrinhos.get('/', async (req, res) => {
  res.json({ dados: await lerCarrinho(req.usuario.id) });
});

/** Cria e ja ativa: quem cria "Civic prata" quer montar a lista dele agora. */
rotasCarrinhos.post('/', async (req, res) => {
  const nome = lerNome(exigirObjeto(req.body));

  criarCarrinho(req.usuario.id, nome);
  res.status(201).json({ dados: await lerCarrinho(req.usuario.id) });
});

/** Conteudo de um carrinho especifico, ativo ou nao (so leitura). */
rotasCarrinhos.get('/:id', async (req, res) => {
  res.json({ dados: await lerCarrinhoPorId(req.usuario.id, lerIdDaRota(req.params.id)) });
});

rotasCarrinhos.patch('/:id', async (req, res) => {
  const id = lerIdDaRota(req.params.id);
  const nome = lerNome(exigirObjeto(req.body));

  renomearCarrinho(req.usuario.id, id, nome);
  res.json({ dados: await lerCarrinho(req.usuario.id) });
});

/** Troca o carrinho ativo (o que a vitrine mostra e o checkout fecha). */
rotasCarrinhos.post('/:id/ativar', async (req, res) => {
  ativarCarrinho(req.usuario.id, lerIdDaRota(req.params.id));
  res.json({ dados: await lerCarrinho(req.usuario.id) });
});

rotasCarrinhos.delete('/:id', async (req, res) => {
  excluirCarrinho(req.usuario.id, lerIdDaRota(req.params.id));
  res.json({ dados: await lerCarrinho(req.usuario.id) });
});

// /api/carrinhos/:id/itens...  (o id vem da URL, nunca "do ativo")
const rotasDeItens = Router({ mergeParams: true });
registrarRotasDeItens(rotasDeItens, (req) => lerIdDaRota(req.params.id));
rotasCarrinhos.use('/:id', rotasDeItens);
