import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { Carrinho } from '../src/paginas/Carrinho.jsx';
import { Checkout } from '../src/paginas/Checkout.jsx';
import { erroApi, estado, item, renderizar, rotasBase, servidorFalso } from './ajudas.jsx';

const endereco = (id, apelido, principal = false) => ({
  id, apelido, principal, cep: '01001-000', logradouro: `Rua ${apelido}`, numero: String(id),
  complemento: null, bairro: 'Centro', cidade: 'São Paulo', uf: 'SP',
});

describe('KZN-331: o pedido sai para o endereco ESCOLHIDO', () => {
  const cenario = (extras = {}) =>
    servidorFalso(rotasBase(estado({ id: 4, nome: 'Gol do João', itens: [item('PEC-001', 2)] }), {
      'GET /api/enderecos': [endereco(1, 'Casa', true), endereco(2, 'Oficina')],
      ...extras,
    }));

  test('escolhi "Oficina" (o principal e "Casa"): vai endereco_id 2', async () => {
    const servidor = cenario({ 'POST /api/pedidos': { numero: 'PED-0001' } });
    const usuario = userEvent.setup();
    renderizar(<Checkout />);

    await usuario.click(await screen.findByRole('radio', { name: /Oficina/ }));
    await usuario.click(screen.getByRole('button', { name: 'Confirmar pedido' }));

    await waitFor(() => expect(servidor.chamou('POST /api/pedidos')).toHaveLength(1));
    expect(servidor.ultima('POST /api/pedidos').corpo.endereco_id).toBe(2);
  });

  test('sem mexer na escolha, o principal ja vem marcado', async () => {
    const servidor = cenario({ 'POST /api/pedidos': { numero: 'PED-0001' } });
    const usuario = userEvent.setup();
    renderizar(<Checkout />);

    expect(await screen.findByRole('radio', { name: /Casa/ })).toBeChecked();
    await usuario.click(screen.getByRole('button', { name: 'Confirmar pedido' }));

    await waitFor(() => expect(servidor.chamou('POST /api/pedidos')).toHaveLength(1));
    expect(servidor.ultima('POST /api/pedidos').corpo.endereco_id).toBe(1);
  });

  test('a tela repete para onde vai a entrega antes de confirmar', async () => {
    cenario();
    const usuario = userEvent.setup();
    renderizar(<Checkout />);

    await usuario.click(await screen.findByRole('radio', { name: /Oficina/ }));

    expect(screen.getByText(/Entrega em/)).toHaveTextContent('Oficina');
  });

  test('fecha o carrinho que a pessoa estava vendo (carrinho_id explicito)', async () => {
    const servidor = cenario({ 'POST /api/pedidos': { numero: 'PED-0001' } });
    const usuario = userEvent.setup();
    renderizar(<Checkout />);

    await usuario.click(await screen.findByRole('button', { name: 'Confirmar pedido' }));

    await waitFor(() => expect(servidor.chamou('POST /api/pedidos')).toHaveLength(1));
    expect(servidor.ultima('POST /api/pedidos').corpo.carrinho_id).toBe(4);
  });

  test('depois do pedido o carrinho e relido e a tela vai para o detalhe do pedido', async () => {
    let leituras = 0;
    cenario({
      'GET /api/carrinhos': () => {
        leituras += 1;
        return leituras === 1
          ? estado({ id: 4, nome: 'Gol do João', itens: [item('PEC-001', 2)], outros: [{ id: 2, nome: 'Civic prata', pecas: 4 }] })
          : estado({ id: 2, nome: 'Civic prata', itens: [item('PEC-009', 4)] });
      },
      'POST /api/pedidos': { numero: 'PED-0042' },
    });
    const usuario = userEvent.setup();
    renderizar(<Checkout />);

    await usuario.click(await screen.findByRole('button', { name: 'Confirmar pedido' }));

    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('/pedidos/PED-0042'));
    expect(leituras).toBeGreaterThanOrEqual(2);
  });

  test('mostra qual carrinho esta sendo fechado e que os outros continuam salvos', async () => {
    servidorFalso(rotasBase(
      estado({ id: 4, nome: 'Gol do João', itens: [item('PEC-001')], outros: [{ id: 2, nome: 'Civic prata', pecas: 1 }, { id: 3, nome: 'Fiesta', pecas: 2 }] }),
      { 'GET /api/enderecos': [endereco(1, 'Casa', true)] },
    ));
    renderizar(<Checkout />);

    expect(await screen.findByText(/seus outros 2 carrinhos continuam salvos/)).toBeInTheDocument();
  });

  test('o servidor recusou (estoque): mostra o motivo e continua na tela', async () => {
    cenario({
      'POST /api/pedidos': erroApi(409, 'CARRINHO_COM_PENDENCIAS', 'Alguns itens do carrinho precisam de ajuste.', [
        { codigo_produto: 'PEC-001', motivo: 'Sem estoque no momento.' },
      ]),
    });
    const usuario = userEvent.setup();
    renderizar(<Checkout />);

    await usuario.click(await screen.findByRole('button', { name: 'Confirmar pedido' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('precisam de ajuste');
    expect(screen.getByTestId('url')).toHaveTextContent('/');
  });
});

describe('KZN-312: item indisponivel nao entra no total', () => {
  test('linha riscada com "fora do total"; o total soma so o que da para comprar', async () => {
    const inicial = estado({
      itens: [
        item('PEC-001', 2), // R$ 20
        item('PEC-003', 3, { disponivel: false, problema: 'Sem estoque no momento.', valor_total: 30 }),
      ],
    });
    servidorFalso(rotasBase(inicial));
    renderizar(<Carrinho />);

    expect(await screen.findByText('Sem estoque no momento.')).toBeInTheDocument();
    expect(screen.getByText('fora do total')).toBeInTheDocument();
    // Total do resumo = so os R$ 20 do item disponivel.
    expect(screen.getByText('Total').nextElementSibling).toHaveTextContent(/R\$\s?20,00/);
    expect(screen.getByRole('button', { name: 'Fechar pedido' })).toBeDisabled();
  });
});

describe('pagina do carrinho com varios carrinhos', () => {
  test('carrinho vazio continua mostrando o seletor (nao prende a pessoa)', async () => {
    servidorFalso(rotasBase(estado({ id: 1, nome: 'Meu carrinho', itens: [], outros: [{ id: 2, nome: 'Civic prata', pecas: 4 }] })));
    renderizar(<Carrinho />);

    expect(await screen.findByText(/O carrinho "Meu carrinho" está vazio/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /carrinho/i })).toBeInTheDocument();
  });

  test('o resumo diz de qual carrinho e o total', async () => {
    servidorFalso(rotasBase(estado({ nome: 'Gol do João', itens: [item('PEC-001', 2)] })));
    renderizar(<Carrinho />);

    expect(await screen.findByText(/Resumo · Gol do João/)).toBeInTheDocument();
  });

  test('"Esvaziar" limpa os itens mas o carrinho continua na lista', async () => {
    const servidor = servidorFalso(
      rotasBase(estado({ id: 1, nome: 'Gol do João', itens: [item('PEC-001', 2)] }), {
        'DELETE /api/carrinhos/1/itens': estado({ id: 1, nome: 'Gol do João', itens: [] }),
      }),
    );
    const usuario = userEvent.setup();
    renderizar(<Carrinho />);

    await usuario.click(await screen.findByRole('button', { name: 'Esvaziar' }));

    expect(await screen.findByText(/O carrinho "Gol do João" está vazio/)).toBeInTheDocument();
    expect(servidor.chamou('DELETE /api/carrinhos/1/itens')).toHaveLength(1);
  });
});
