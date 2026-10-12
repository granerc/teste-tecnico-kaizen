import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { useAuth } from '../src/contextos/AuthContext.jsx';
import { useCarrinho } from '../src/contextos/CarrinhoContext.jsx';
import { adiada, estado, item, renderizar, rotasBase, servidorFalso } from './ajudas.jsx';

/** Expõe o contexto como botões e texto, sem a interface real no caminho. */
function Sonda() {
  const { carrinho, ativar, adicionar } = useCarrinho();
  const { sair } = useAuth();

  return (
    <div>
      <p data-testid="nome">{carrinho.nome || '(vazio)'}</p>
      <p data-testid="pecas">{carrinho.quantidade_pecas}</p>
      <p data-testid="lista">{carrinho.carrinhos.map((c) => c.nome).join(',')}</p>
      <button onClick={() => ativar(2).catch(() => {})}>ativar-2</button>
      <button onClick={() => ativar(3).catch(() => {})}>ativar-3</button>
      <button onClick={() => adicionar('PEC-001', 1).catch(() => {})}>adicionar</button>
      <button onClick={() => sair()}>sair</button>
    </div>
  );
}

const inicial = () => estado({ id: 1, nome: 'Meu carrinho', itens: [item('PEC-001', 2)] });

describe('CarrinhoContext', () => {
  test('na entrada carrega o carrinho ativo da conta (o que ficou ativo da ultima vez)', async () => {
    servidorFalso(rotasBase(estado({ id: 4, nome: 'Civic prata', itens: [item('PEC-009', 3)] })));
    renderizar(<Sonda />);

    await waitFor(() => expect(screen.getByTestId('nome')).toHaveTextContent('Civic prata'));
    expect(screen.getByTestId('pecas')).toHaveTextContent('3');
  });

  test('duas trocas seguidas: a resposta MAIS RECENTE vence, mesmo que a antiga chegue depois', async () => {
    const lenta = adiada();
    const civic = estado({ id: 2, nome: 'Civic prata', itens: [item('PEC-009', 4)] });
    const fiesta = estado({ id: 3, nome: 'Fiesta', itens: [item('PEC-777', 1)] });

    servidorFalso(rotasBase(inicial(), {
      'POST /api/carrinhos/2/ativar': () => lenta.promessa, // pendurada
      'POST /api/carrinhos/3/ativar': fiesta, // responde na hora
    }));
    const usuario = userEvent.setup();
    renderizar(<Sonda />);
    await waitFor(() => expect(screen.getByTestId('nome')).toHaveTextContent('Meu carrinho'));

    await usuario.click(screen.getByText('ativar-2'));
    await usuario.click(screen.getByText('ativar-3'));
    await waitFor(() => expect(screen.getByTestId('nome')).toHaveTextContent('Fiesta'));

    // Agora a antiga finalmente responde. Nao pode desfazer a escolha mais nova.
    await act(async () => {
      lenta.resolver(civic);
      await new Promise((ok) => setTimeout(ok, 30));
    });

    expect(screen.getByTestId('nome')).toHaveTextContent('Fiesta');
  });

  test('sair da conta descarta os carrinhos da memoria (nada vaza para a proxima conta)', async () => {
    servidorFalso(rotasBase(inicial(), {
      'POST /api/auth/logout': { mensagem: 'Sessao encerrada.' },
    }));
    const usuario = userEvent.setup();
    renderizar(<Sonda />);
    await waitFor(() => expect(screen.getByTestId('pecas')).toHaveTextContent('2'));

    await usuario.click(screen.getByText('sair'));

    await waitFor(() => expect(screen.getByTestId('nome')).toHaveTextContent('(vazio)'));
    expect(screen.getByTestId('pecas')).toHaveTextContent('0');
    expect(screen.getByTestId('lista')).toHaveTextContent('');
  });

  test('resposta que chega DEPOIS do logout nao repopula o carrinho', async () => {
    const lenta = adiada();
    servidorFalso(rotasBase(inicial(), {
      'POST /api/carrinhos/1/itens': () => lenta.promessa,
      'POST /api/auth/logout': { mensagem: 'ok' },
    }));
    const usuario = userEvent.setup();
    renderizar(<Sonda />);
    await waitFor(() => expect(screen.getByTestId('pecas')).toHaveTextContent('2'));

    await usuario.click(screen.getByText('adicionar')); // fica pendurada
    await usuario.click(screen.getByText('sair'));
    await waitFor(() => expect(screen.getByTestId('pecas')).toHaveTextContent('0'));

    await act(async () => {
      lenta.resolver(estado({ id: 1, nome: 'Meu carrinho', itens: [item('PEC-001', 3)] }));
      await new Promise((ok) => setTimeout(ok, 30));
    });

    expect(screen.getByTestId('pecas')).toHaveTextContent('0');
  });

  test('as acoes de item usam o id do carrinho MOSTRADO, nao "o ativo"', async () => {
    const servidor = servidorFalso(rotasBase(estado({ id: 9, nome: 'Oficina', itens: [] }), {
      'POST /api/carrinhos/9/itens': estado({ id: 9, nome: 'Oficina', itens: [item('PEC-001', 1)] }),
    }));
    const usuario = userEvent.setup();
    renderizar(<Sonda />);
    await waitFor(() => expect(screen.getByTestId('nome')).toHaveTextContent('Oficina'));

    await usuario.click(screen.getByText('adicionar'));

    await waitFor(() => expect(servidor.chamou('POST /api/carrinhos/9/itens')).toHaveLength(1));
    expect(servidor.ultima('POST /api/carrinhos/9/itens').corpo).toEqual({ codigo_produto: 'PEC-001', quantidade: 1 });
  });
});
