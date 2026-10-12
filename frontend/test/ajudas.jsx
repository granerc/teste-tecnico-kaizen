import { render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import { ProvedorAuth } from '../src/contextos/AuthContext.jsx';
import { ProvedorCarrinho } from '../src/contextos/CarrinhoContext.jsx';

/* ------------------------------------------------------------------ dados -- */

export function item(codigo, quantidade = 1, extra = {}) {
  return {
    codigo_produto: codigo,
    descricao: `Peça ${codigo}`,
    marca: 'Teste',
    imagem_url: '/api/imagens/generico.svg',
    preco_unitario: 10,
    quantidade,
    estoque: 20,
    disponivel: true,
    problema: null,
    valor_total: 10 * quantidade,
    ...extra,
  };
}

/**
 * Estado que a API devolve: conteudo do carrinho ATIVO + resumo de todos.
 * `outros` sao os carrinhos inativos: [{ id, nome, pecas }].
 */
export function estado({ id = 1, nome = 'Meu carrinho', itens = [], outros = [], limite = 10 } = {}) {
  const pecas = itens.reduce((soma, i) => soma + i.quantidade, 0);
  const disponiveis = itens.filter((i) => i.disponivel);

  return {
    id,
    nome,
    itens,
    quantidade_itens: itens.length,
    quantidade_pecas: pecas,
    valor_total: disponiveis.reduce((soma, i) => soma + i.valor_total, 0),
    pronto_para_checkout: itens.length > 0 && itens.every((i) => i.disponivel),
    carrinhos: [
      { id, nome, ativo: true, quantidade_itens: itens.length, quantidade_pecas: pecas },
      ...outros.map((o) => ({
        id: o.id, nome: o.nome, ativo: false, quantidade_itens: 1, quantidade_pecas: o.pecas ?? 0,
      })),
    ].sort((a, b) => a.id - b.id),
    limite_carrinhos: limite,
  };
}

export const usuario = { id: 7, nome: 'Camila Teste', email: 'c@exemplo.com' };

/* --------------------------------------------------------- servidor falso -- */

function resposta(status, corpo) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(corpo),
  });
}

/** Resposta com o corpo exatamente como o backend manda (ex.: lista + paginacao). */
export const bruto = (corpo) => ({ status: 200, corpo });

export const erroApi = (status, codigo, mensagem, detalhes) => ({
  status,
  corpo: { erro: { codigo, mensagem, detalhes } },
});

/**
 * Troca o fetch por um servidor de mentira.
 *
 * `rotas` mapeia "METODO /caminho" para o que responder: um objeto (200), uma
 * funcao (recebe o corpo JSON e { query }, e devolve objeto ou erroApi), ou { status, corpo }.
 * Chamada sem rota cadastrada vira 404 com o nome da rota - o teste falha dizendo
 * exatamente o que faltou, em vez de ficar pendurado.
 */
export function servidorFalso(rotas = {}) {
  const chamadas = [];

  const fetchFalso = vi.fn((url, init = {}) => {
    const metodo = (init.method ?? 'GET').toUpperCase();
    const [caminho, textoQuery = ''] = String(url).split('?');
    const query = new URLSearchParams(textoQuery);
    const chave = `${metodo} ${caminho}`;
    const corpo = init.body ? JSON.parse(init.body) : undefined;

    chamadas.push({ metodo, caminho, url: String(url), query, corpo, chave });

    const rota = rotas[chave];
    if (rota === undefined) {
      return resposta(404, { erro: { codigo: 'ROTA_FALSA_AUSENTE', mensagem: `Sem rota falsa: ${chave}` } });
    }

    const valor = typeof rota === 'function' ? rota(corpo, { query }) : rota;
    if (valor && typeof valor.then === 'function') return valor.then((v) => converter(v));
    return converter(valor);
  });

  function converter(valor) {
    if (valor && valor.status && valor.corpo) return resposta(valor.status, valor.corpo);
    return resposta(200, { dados: valor });
  }

  vi.stubGlobal('fetch', fetchFalso);

  return {
    chamadas,
    chamou: (chave) => chamadas.filter((c) => c.chave === chave),
    ultima: (chave) => chamadas.filter((c) => c.chave === chave).at(-1),
    rotas,
  };
}

/** Promessa que o teste resolve na hora que quiser (para forcar a ordem das respostas). */
export function adiada() {
  let resolver;
  const promessa = new Promise((ok) => { resolver = ok; });
  return { promessa, resolver };
}

/* ------------------------------------------------------------- renderizar -- */

/** Mostra a URL atual na tela, para o teste conferir busca/pagina. */
function SondaDeUrl() {
  const { pathname, search } = useLocation();
  return <output data-testid="url">{pathname + search}</output>;
}

export function renderizar(elemento, { url = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ProvedorAuth>
        <ProvedorCarrinho>
          {elemento}
          <SondaDeUrl />
        </ProvedorCarrinho>
      </ProvedorAuth>
    </MemoryRouter>,
  );
}

/** Rotas que quase todo teste precisa: sessao + carrinho inicial. */
export function rotasBase(estadoInicial, extras = {}) {
  return {
    'GET /api/auth/eu': usuario,
    'GET /api/carrinhos': estadoInicial,
    ...extras,
  };
}

/* --------------------------------------------------------------- catalogo -- */

export function produto(codigo, extra = {}) {
  return {
    codigo,
    descricao: `Produto ${codigo}`,
    marca: 'Marca',
    aplicacao: '',
    preco_unitario: 10,
    estoque: 10,
    imagem_url: '/api/imagens/generico.svg',
    ...extra,
  };
}

// `total` explicito: uma pagina alem do fim vem VAZIA mas com o total verdadeiro
// (e e isso que diferencia "pagina inexistente" de "busca sem resultados").
export const paginaDeCatalogo = (produtos, { pagina = 1, totalPaginas = 1, total } = {}) =>
  bruto({
    dados: produtos,
    paginacao: {
      pagina,
      tamanho: 24,
      total: total ?? produtos.length * totalPaginas,
      total_paginas: totalPaginas,
    },
  });
