import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { Cabecalho } from '../src/componentes/Cabecalho.jsx';
import { CarrinhoMovel } from '../src/componentes/PainelCarrinho.jsx';
import { Catalogo } from '../src/paginas/Catalogo.jsx';
import {
  erroApi, estado, item, paginaDeCatalogo, produto, renderizar, rotasBase, servidorFalso,
} from './ajudas.jsx';

const url = () => screen.getByTestId('url').textContent;

const carrinhoGol = () =>
  estado({
    id: 1,
    nome: 'Gol do João',
    itens: [item('PEC-001', 2)],
    outros: [{ id: 2, nome: 'Civic prata', pecas: 4 }],
  });

function rotasVitrine(extras = {}) {
  return rotasBase(carrinhoGol(), {
    'GET /api/catalogo/categorias': ['FREIOS', 'MOTOR'],
    'GET /api/catalogo': paginaDeCatalogo([produto('P-1'), produto('P-2')], { pagina: 2, totalPaginas: 3 }),
    ...extras,
  });
}

describe('KZN-325: mudar a busca ou o filtro volta para a primeira pagina', () => {
  test('escolher uma categoria descarta ?pagina= e mantem a busca', async () => {
    servidorFalso(rotasVitrine());
    const usuario = userEvent.setup();
    renderizar(<Catalogo />, { url: '/?busca=amortecedor&pagina=2' });

    await usuario.click(await screen.findByRole('button', { name: 'freios' }));

    await waitFor(() => expect(url()).toBe('/?busca=amortecedor&categoria=FREIOS'));
  });

  test('marcar "Só com estoque" tambem descarta a pagina', async () => {
    servidorFalso(rotasVitrine());
    const usuario = userEvent.setup();
    renderizar(<Catalogo />, { url: '/?pagina=2' });

    await usuario.click(await screen.findByLabelText('Só com estoque'));

    await waitFor(() => expect(url()).toBe('/?somente_disponiveis=true'));
  });

  test('"Próxima" muda so a pagina e preserva o resto da busca', async () => {
    servidorFalso(rotasVitrine());
    const usuario = userEvent.setup();
    renderizar(<Catalogo />, { url: '/?busca=freio&pagina=2' });

    await usuario.click(await screen.findByRole('button', { name: 'Próxima' }));

    await waitFor(() => expect(url()).toBe('/?busca=freio&pagina=3'));
  });

  test('link com pagina alem do fim vai para a ultima que existe', async () => {
    servidorFalso(rotasVitrine({
      'GET /api/catalogo': (_corpo, { query }) =>
        query.get('pagina') === '9'
          ? paginaDeCatalogo([], { pagina: 9, totalPaginas: 3, total: 60 })
          : paginaDeCatalogo([produto('P-1')], { pagina: Number(query.get('pagina')), totalPaginas: 3 }),
    }));
    renderizar(<Catalogo />, { url: '/?busca=freio&pagina=9' });

    await waitFor(() => expect(url()).toBe('/?busca=freio&pagina=3'));
  });
});

describe('KZN-325: a busca do cabecalho recomeca da primeira pagina', () => {
  test('pesquisar mantem os filtros mas descarta a pagina', async () => {
    servidorFalso(rotasBase(carrinhoGol()));
    const usuario = userEvent.setup();
    renderizar(<Cabecalho />, { url: '/?busca=velha&categoria=FREIOS&pagina=4' });

    const campo = await screen.findByRole('searchbox', { name: /buscar peças/i });
    await usuario.clear(campo);
    await usuario.type(campo, 'amortecedor{Enter}');

    await waitFor(() => expect(url()).toBe('/?busca=amortecedor&categoria=FREIOS'));
  });

  test('o campo acompanha a URL (limpar a busca esvazia a caixa)', async () => {
    servidorFalso(rotasBase(carrinhoGol()));
    renderizar(
      <>
        <Cabecalho />
        <Catalogo />
      </>,
      { url: '/?busca=amortecedor' },
    );
    // sem rota de catalogo cadastrada o Catalogo mostra erro; so queremos o campo.
    const campo = await screen.findByRole('searchbox', { name: /buscar peças/i });
    expect(campo).toHaveValue('amortecedor');
  });
});

describe('KZN-318: o contador do cabecalho mostra PECAS, nao linhas', () => {
  test('2 + 5 unidades em 2 linhas mostra 7', async () => {
    const inicial = estado({ nome: 'Gol do João', itens: [item('PEC-001', 2), item('PEC-002', 5)] });
    servidorFalso(rotasBase(inicial));
    renderizar(<Cabecalho />);

    const selo = await screen.findByLabelText(/peças no carrinho Gol do João/);
    expect(selo).toHaveTextContent('7');
    expect(selo).not.toHaveTextContent('2');
  });

  test('carrinho vazio nao mostra selo', async () => {
    servidorFalso(rotasBase(estado({ itens: [] })));
    renderizar(<Cabecalho />);

    await screen.findByRole('link', { name: /carrinho/i });
    expect(screen.queryByLabelText(/peças no carrinho/)).not.toBeInTheDocument();
  });
});

describe('vitrine com o carrinho ao lado', () => {
  test('editar o carrinho NAO mexe na URL nem recarrega o catalogo (nao perde a posicao)', async () => {
    const depois = estado({ id: 1, nome: 'Gol do João', itens: [item('PEC-001', 3)], outros: [{ id: 2, nome: 'Civic prata', pecas: 4 }] });
    const servidor = servidorFalso(rotasVitrine({ 'PATCH /api/carrinhos/1/itens/PEC-001': depois }));
    const usuario = userEvent.setup();
    renderizar(<Catalogo />, { url: '/?busca=freio&categoria=FREIOS&pagina=2' });

    await screen.findByText('Produto P-1');
    const urlAntes = url();
    const buscasAntes = servidor.chamou('GET /api/catalogo').length;

    await usuario.click(await screen.findByRole('button', { name: 'Aumentar quantidade de Peça PEC-001' }));
    await waitFor(() => expect(screen.getByLabelText('Quantidade: 3')).toBeInTheDocument());

    expect(url()).toBe(urlAntes);
    expect(servidor.chamou('GET /api/catalogo')).toHaveLength(buscasAntes);
    expect(screen.getByText('Produto P-1')).toBeInTheDocument();
  });

  test('"Adicionar" coloca no carrinho ATIVO e diz o nome dele', async () => {
    const depois = estado({
      id: 1, nome: 'Gol do João', itens: [item('PEC-001', 2), item('P-1', 1)],
      outros: [{ id: 2, nome: 'Civic prata', pecas: 4 }],
    });
    const servidor = servidorFalso(rotasVitrine({ 'POST /api/carrinhos/1/itens': depois }));
    const usuario = userEvent.setup();
    renderizar(<Catalogo />);

    const cartao = (await screen.findByText('Produto P-1')).closest('article');
    await usuario.click(within(cartao).getByRole('button', { name: 'Adicionar' }));

    expect(await screen.findByText(/Produto P-1 foi para o carrinho "Gol do João"/)).toBeInTheDocument();
    expect(servidor.ultima('POST /api/carrinhos/1/itens').corpo).toEqual({ codigo_produto: 'P-1', quantidade: 1 });
  });

  test('erro ao adicionar (sem estoque) aparece na vitrine', async () => {
    servidorFalso(rotasVitrine({
      'POST /api/carrinhos/1/itens': erroApi(409, 'ESTOQUE_INSUFICIENTE', 'Restam apenas 1 unidades em estoque.'),
    }));
    const usuario = userEvent.setup();
    renderizar(<Catalogo />);

    const cartao = (await screen.findByText('Produto P-1')).closest('article');
    await usuario.click(within(cartao).getByRole('button', { name: 'Adicionar' }));

    expect(await screen.findByText(/Restam apenas 1 unidades/)).toBeInTheDocument();
  });

  test('recolher o painel lembra a escolha; "Mostrar carrinho" traz de volta', async () => {
    servidorFalso(rotasVitrine());
    const usuario = userEvent.setup();
    renderizar(<Catalogo />);

    await usuario.click(await screen.findByRole('button', { name: 'Recolher' }));

    expect(screen.queryByRole('region', { name: 'Seu carrinho' })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('kaizen.painel-carrinho')).toBe('fechado');

    await usuario.click(screen.getByRole('button', { name: /Mostrar carrinho \(2\)/ }));
    expect(await screen.findByRole('region', { name: 'Seu carrinho' })).toBeInTheDocument();
    expect(window.localStorage.getItem('kaizen.painel-carrinho')).toBe('aberto');
  });

  test('visitante sem conta nao ve painel nem botao do carrinho', async () => {
    servidorFalso({
      'GET /api/auth/eu': erroApi(401, 'NAO_AUTENTICADO', 'Sessao invalida.'),
      'GET /api/catalogo/categorias': [],
      'GET /api/catalogo': paginaDeCatalogo([produto('P-1')]),
    });
    renderizar(<Catalogo />);

    await screen.findByText('Produto P-1');
    expect(screen.queryByRole('region', { name: 'Seu carrinho' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Carrinho/ })).not.toBeInTheDocument();
  });
});

describe('carrinho no celular (gaveta)', () => {
  async function abrirGaveta() {
    servidorFalso(rotasBase(carrinhoGol()));
    const usuario = userEvent.setup();
    renderizar(<CarrinhoMovel />);

    const botao = await screen.findByRole('button', { name: /Carrinho 2 peças no carrinho Gol do João/ });
    await usuario.click(botao);
    return { usuario, botao };
  }

  test('o botao flutuante mostra as pecas e abre o painel completo num dialogo', async () => {
    await abrirGaveta();

    const dialogo = screen.getByRole('dialog', { name: 'Seu carrinho' });
    expect(dialogo).toHaveAttribute('aria-modal', 'true');
    expect(within(dialogo).getByText('Peça PEC-001')).toBeInTheDocument();
    expect(within(dialogo).getByRole('combobox', { name: /carrinho/i })).toBeInTheDocument();
  });

  test('Esc fecha e o foco volta para o botao que abriu', async () => {
    const { usuario, botao } = await abrirGaveta();

    await usuario.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(botao).toHaveFocus();
  });

  test('a pagina nao rola por tras enquanto a gaveta esta aberta', async () => {
    const { usuario } = await abrirGaveta();
    expect(document.body.style.overflow).toBe('hidden');

    await usuario.keyboard('{Escape}');
    await waitFor(() => expect(document.body.style.overflow).not.toBe('hidden'));
  });

  test('Tab nao escapa da gaveta (foco preso)', async () => {
    const { usuario } = await abrirGaveta();
    const dialogo = screen.getByRole('dialog');

    for (let i = 0; i < 25; i += 1) {
      await usuario.tab();
      expect(dialogo.contains(document.activeElement)).toBe(true);
    }
  });
});
