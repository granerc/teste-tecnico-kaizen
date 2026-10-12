import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { PainelCarrinho } from '../src/componentes/PainelCarrinho.jsx';
import { erroApi, estado, item, renderizar, rotasBase, servidorFalso } from './ajudas.jsx';

const comDoisCarrinhos = () =>
  estado({
    id: 1,
    nome: 'Gol do João',
    itens: [item('PEC-001', 2), item('PEC-002', 1)],
    outros: [{ id: 2, nome: 'Civic prata', pecas: 4 }],
  });

async function abrirPainel(rotas = {}, inicial = comDoisCarrinhos()) {
  const servidor = servidorFalso(rotasBase(inicial, rotas));
  const usuario = userEvent.setup();
  renderizar(<PainelCarrinho />);
  await screen.findByText('Peça PEC-001');
  return { servidor, usuario };
}

describe('PainelCarrinho: leitura', () => {
  test('mostra o carrinho ativo, os itens, as pecas e o total', async () => {
    await abrirPainel();

    expect(screen.getByRole('combobox', { name: /carrinho/i })).toHaveValue('1');
    expect(screen.getByText('Peça PEC-001')).toBeInTheDocument();
    expect(screen.getByText('Peça PEC-002')).toBeInTheDocument();
    expect(screen.getByText(/Total · 3 peças/)).toBeInTheDocument();
  });

  test('o seletor lista TODOS os carrinhos com a contagem de pecas de cada um', async () => {
    await abrirPainel();

    const opcoes = within(screen.getByRole('combobox', { name: /carrinho/i }))
      .getAllByRole('option')
      .map((o) => o.textContent);

    expect(opcoes).toEqual(['Gol do João · 3 peças', 'Civic prata · 4 peças']);
  });

  test('carrinho vazio explica o que fazer e desabilita o fechamento', async () => {
    servidorFalso(rotasBase(estado({ nome: 'Meu carrinho' })));
    renderizar(<PainelCarrinho />);

    expect(await screen.findByText(/Este carrinho está vazio/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /fechar este pedido/i })).toBeDisabled();
  });

  test('item sem estoque aparece riscado, "fora do total", e bloqueia o fechamento', async () => {
    const inicial = estado({
      itens: [item('PEC-001', 1), item('PEC-003', 2, { disponivel: false, problema: 'Sem estoque no momento.', valor_total: 20 })],
    });
    servidorFalso(rotasBase(inicial));
    renderizar(<PainelCarrinho />);

    expect(await screen.findByText('Sem estoque no momento.')).toBeInTheDocument();
    expect(screen.getByText('fora do total')).toBeInTheDocument();
    // So o item disponivel (R$ 10) entra no total.
    expect(screen.getByText(/R\$\s?10,00$/, { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /fechar este pedido/i })).toBeDisabled();
  });
});

describe('PainelCarrinho: trocar de carrinho', () => {
  test('escolher outro no seletor ativa o carrinho certo e mostra o conteudo dele', async () => {
    const civic = estado({ id: 2, nome: 'Civic prata', itens: [item('PEC-009', 4)], outros: [{ id: 1, nome: 'Gol do João', pecas: 3 }] });
    const { servidor, usuario } = await abrirPainel({ 'POST /api/carrinhos/2/ativar': civic });

    await usuario.selectOptions(screen.getByRole('combobox', { name: /carrinho/i }), '2');

    expect(await screen.findByText('Peça PEC-009')).toBeInTheDocument();
    expect(screen.queryByText('Peça PEC-001')).not.toBeInTheDocument();
    expect(servidor.chamou('POST /api/carrinhos/2/ativar')).toHaveLength(1);
    expect(screen.getByRole('combobox', { name: /carrinho/i })).toHaveValue('2');
  });
});

describe('PainelCarrinho: novo carrinho', () => {
  test('cria com o nome digitado e passa a mostrar o novo (vazio)', async () => {
    const novo = estado({ id: 3, nome: 'Fiesta', outros: [{ id: 1, nome: 'Gol do João', pecas: 3 }, { id: 2, nome: 'Civic prata', pecas: 4 }] });
    const { servidor, usuario } = await abrirPainel({ 'POST /api/carrinhos': novo });

    await usuario.click(screen.getByRole('button', { name: 'Novo carrinho' }));
    await usuario.type(screen.getByLabelText('Nome do novo carrinho'), '  Fiesta ');
    await usuario.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findByText(/Este carrinho está vazio/)).toBeInTheDocument();
    expect(servidor.ultima('POST /api/carrinhos').corpo).toEqual({ nome: 'Fiesta' });
    expect(screen.queryByLabelText('Nome do novo carrinho')).not.toBeInTheDocument();
  });

  test('nome repetido: mostra o erro do servidor e mantem o formulario aberto', async () => {
    const { usuario } = await abrirPainel({
      'POST /api/carrinhos': erroApi(409, 'NOME_EM_USO', 'Voce ja tem um carrinho com esse nome.', [
        { campo: 'nome', mensagem: 'Voce ja tem um carrinho com esse nome.' },
      ]),
    });

    await usuario.click(screen.getByRole('button', { name: 'Novo carrinho' }));
    await usuario.type(screen.getByLabelText('Nome do novo carrinho'), 'civic prata');
    await usuario.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('ja tem um carrinho com esse nome');
    expect(screen.getByLabelText('Nome do novo carrinho')).toHaveValue('civic prata');
  });

  test('nome vazio nem chega ao servidor', async () => {
    const { servidor, usuario } = await abrirPainel();

    await usuario.click(screen.getByRole('button', { name: 'Novo carrinho' }));
    await usuario.type(screen.getByLabelText('Nome do novo carrinho'), '   ');
    await usuario.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Dê um nome');
    expect(servidor.chamou('POST /api/carrinhos')).toHaveLength(0);
  });

  test('no limite de carrinhos o botao fica desabilitado e explica por que', async () => {
    const outros = Array.from({ length: 9 }, (_, i) => ({ id: i + 2, nome: `C${i + 2}`, pecas: 0 }));
    servidorFalso(rotasBase(estado({ itens: [item('PEC-001')], outros, limite: 10 })));
    renderizar(<PainelCarrinho />);

    await screen.findByText('Peça PEC-001');
    expect(screen.getByRole('button', { name: 'Novo carrinho' })).toBeDisabled();
    expect(screen.getByText(/limite de 10 carrinhos/i)).toBeInTheDocument();
  });
});

describe('PainelCarrinho: renomear e excluir', () => {
  test('renomear parte do nome atual e envia o novo', async () => {
    const renomeado = estado({ id: 1, nome: 'Gol 1.0', itens: [item('PEC-001', 2), item('PEC-002', 1)], outros: [{ id: 2, nome: 'Civic prata', pecas: 4 }] });
    const { servidor, usuario } = await abrirPainel({ 'PATCH /api/carrinhos/1': renomeado });

    await usuario.click(screen.getByRole('button', { name: 'Renomear' }));
    const campo = screen.getByLabelText('Novo nome do carrinho');
    expect(campo).toHaveValue('Gol do João');

    await usuario.clear(campo);
    await usuario.type(campo, 'Gol 1.0');
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.getByRole('combobox', { name: /carrinho/i })).toHaveDisplayValue(/Gol 1\.0/));
    expect(servidor.ultima('PATCH /api/carrinhos/1').corpo).toEqual({ nome: 'Gol 1.0' });
  });

  test('excluir pede confirmacao ANTES de chamar o servidor', async () => {
    const depois = estado({ id: 2, nome: 'Civic prata', itens: [item('PEC-009', 4)] });
    const { servidor, usuario } = await abrirPainel({ 'DELETE /api/carrinhos/1': depois });

    await usuario.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(screen.getByText(/Não dá para desfazer/)).toBeInTheDocument();
    expect(screen.getByText(/3 peças\?/)).toBeInTheDocument(); // avisa quanto vai perder
    expect(servidor.chamou('DELETE /api/carrinhos/1')).toHaveLength(0);

    await usuario.click(screen.getByRole('button', { name: 'Excluir carrinho' }));

    expect(await screen.findByText('Peça PEC-009')).toBeInTheDocument();
    expect(servidor.chamou('DELETE /api/carrinhos/1')).toHaveLength(1);
  });

  test('cancelar a exclusao nao chama o servidor', async () => {
    const { servidor, usuario } = await abrirPainel();

    await usuario.click(screen.getByRole('button', { name: 'Excluir' }));
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByText(/Não dá para desfazer/)).not.toBeInTheDocument();
    expect(servidor.chamadas.some((c) => c.metodo === 'DELETE')).toBe(false);
  });
});

describe('PainelCarrinho: editar itens', () => {
  test('+ e − mudam a quantidade no carrinho que esta sendo mostrado', async () => {
    const depois = estado({ id: 1, nome: 'Gol do João', itens: [item('PEC-001', 3), item('PEC-002', 1)], outros: [{ id: 2, nome: 'Civic prata', pecas: 4 }] });
    const { servidor, usuario } = await abrirPainel({ 'PATCH /api/carrinhos/1/itens/PEC-001': depois });

    await usuario.click(screen.getByRole('button', { name: 'Aumentar quantidade de Peça PEC-001' }));

    await waitFor(() => expect(screen.getByLabelText('Quantidade: 3')).toBeInTheDocument());
    expect(servidor.ultima('PATCH /api/carrinhos/1/itens/PEC-001').corpo).toEqual({ quantidade: 3 });
  });

  test('o − fica desabilitado em 1 (para tirar, ha o botao Remover)', async () => {
    await abrirPainel();
    expect(screen.getByRole('button', { name: 'Diminuir quantidade de Peça PEC-002' })).toBeDisabled();
  });

  test('o + respeita o estoque do produto', async () => {
    const inicial = estado({ itens: [item('PEC-001', 5, { estoque: 5 })] });
    servidorFalso(rotasBase(inicial));
    renderizar(<PainelCarrinho />);

    await screen.findByText('Peça PEC-001');
    expect(screen.getByRole('button', { name: 'Aumentar quantidade de Peça PEC-001' })).toBeDisabled();
  });

  test('remover tira a linha', async () => {
    const depois = estado({ id: 1, nome: 'Gol do João', itens: [item('PEC-002', 1)], outros: [{ id: 2, nome: 'Civic prata', pecas: 4 }] });
    const { servidor, usuario } = await abrirPainel({ 'DELETE /api/carrinhos/1/itens/PEC-001': depois });

    await usuario.click(screen.getByRole('button', { name: 'Remover Peça PEC-001' }));

    await waitFor(() => expect(screen.queryByText('Peça PEC-001')).not.toBeInTheDocument());
    expect(servidor.chamou('DELETE /api/carrinhos/1/itens/PEC-001')).toHaveLength(1);
  });

  test('erro do servidor (estoque) aparece no painel sem derrubar o carrinho', async () => {
    const { usuario } = await abrirPainel({
      'PATCH /api/carrinhos/1/itens/PEC-001': erroApi(409, 'ESTOQUE_INSUFICIENTE', 'Restam apenas 2 unidades em estoque.'),
    });

    await usuario.click(screen.getByRole('button', { name: 'Aumentar quantidade de Peça PEC-001' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Restam apenas 2 unidades');
    expect(screen.getByText('Peça PEC-001')).toBeInTheDocument();
  });

  test('carrinho apagado em outra aba (404): o painel se resincroniza com o servidor', async () => {
    let leituras = 0;
    const real = estado({ id: 5, nome: 'Meu carrinho' });
    const { usuario } = await abrirPainel({
      'GET /api/carrinhos': () => { leituras += 1; return leituras === 1 ? comDoisCarrinhos() : real; },
      'PATCH /api/carrinhos/1/itens/PEC-001': erroApi(404, 'NAO_ENCONTRADO', 'Carrinho nao encontrado.'),
    });

    await usuario.click(screen.getByRole('button', { name: 'Aumentar quantidade de Peça PEC-001' }));

    expect(await screen.findByText(/Este carrinho está vazio/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /carrinho/i })).toHaveValue('5');
  });
});
