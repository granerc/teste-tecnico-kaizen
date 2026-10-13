import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { dinheiro } from '../api/cliente.js';
import { useCarrinho } from '../contextos/CarrinhoContext.jsx';
import { Alerta, Botao } from './ui.jsx';
import { SeletorCarrinhos } from './SeletorCarrinhos.jsx';

const MAXIMO_POR_ITEM = 99;

function BotaoQuantidade({ rotulo, children, ...props }) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      {...props}
      className="grid size-8 place-items-center rounded-md border border-tinta-300 bg-white
        text-base font-semibold text-tinta-700 hover:bg-tinta-100
        disabled:cursor-not-allowed disabled:text-tinta-500 disabled:hover:bg-white"
    >
      {children}
    </button>
  );
}

function ItemCompacto({ item, ocupado, aoAlterar, aoRemover }) {
  const limite = Math.min(item.estoque ?? MAXIMO_POR_ITEM, MAXIMO_POR_ITEM);

  return (
    <li className="flex gap-3 py-3">
      <img
        src={item.imagem_url}
        alt=""
        width="48"
        height="48"
        className="size-12 shrink-0 rounded-md bg-tinta-100 object-contain p-0.5"
      />

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-tinta-900">
          <Link to={`/produto/${item.codigo_produto}`} className="hover:underline">
            {item.descricao}
          </Link>
        </p>

        {item.problema && (
          <p className="mt-0.5 text-xs font-medium text-amber-700">{item.problema}</p>
        )}

        <div className="mt-1.5 flex items-center gap-2">
          <BotaoQuantidade
            rotulo={`Diminuir quantidade de ${item.descricao}`}
            disabled={ocupado || item.quantidade <= 1}
            onClick={() => aoAlterar(item.codigo_produto, item.quantidade - 1)}
          >
            −
          </BotaoQuantidade>

          <span
            className="min-w-6 text-center text-sm font-semibold tabular-nums text-tinta-900"
            aria-label={`Quantidade: ${item.quantidade}`}
          >
            {item.quantidade}
          </span>

          <BotaoQuantidade
            rotulo={`Aumentar quantidade de ${item.descricao}`}
            disabled={ocupado || item.quantidade >= limite}
            onClick={() => aoAlterar(item.codigo_produto, item.quantidade + 1)}
          >
            +
          </BotaoQuantidade>

          <button
            type="button"
            onClick={() => aoRemover(item.codigo_produto)}
            disabled={ocupado}
            aria-label={`Remover ${item.descricao}`}
            className="ml-auto text-xs text-tinta-500 underline hover:text-red-700 disabled:opacity-50"
          >
            Remover
          </button>
        </div>
      </div>

      <div className="shrink-0 text-right text-sm font-bold text-tinta-900">
        {item.disponivel ? (
          dinheiro.format(item.valor_total)
        ) : (
          <>
            <span className="text-tinta-500 line-through">{dinheiro.format(item.valor_total)}</span>
            <span className="block text-xs font-normal text-tinta-500">fora do total</span>
          </>
        )}
      </div>
    </li>
  );
}

/**
 * Carrinho ativo, visivel e editavel sem sair da pagina. Usado na lateral da
 * vitrine (desktop) e dentro da gaveta (celular).
 *
 * Nada aqui navega nem mexe na URL: por isso a busca, a categoria e a pagina
 * da vitrine continuam exatamente onde a pessoa deixou.
 */
export function PainelCarrinho({ aoRecolher, aoNavegar }) {
  const { carrinho, carregando, ocupado, alterar, remover } = useCarrinho();
  const [erro, setErro] = useState(null);

  async function agir(acao) {
    setErro(null);
    try {
      await acao();
    } catch (falha) {
      setErro(falha);
    }
  }

  return (
    <section aria-label="Seu carrinho" className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-lg font-bold text-tinta-900">Seu carrinho</h2>
        {aoRecolher && (
          <button
            type="button"
            onClick={aoRecolher}
            className="rounded-md px-2 py-1 text-sm text-tinta-500 hover:bg-tinta-100"
          >
            Recolher
          </button>
        )}
      </div>

      <SeletorCarrinhos />

      {erro && <Alerta tipo="erro">{erro.message}</Alerta>}

      {carregando && carrinho.id === null ? (
        <p className="py-6 text-center text-sm text-tinta-500">Carregando carrinho...</p>
      ) : carrinho.itens.length === 0 ? (
        <p className="rounded-lg border border-dashed border-tinta-300 px-4 py-6 text-center text-sm text-tinta-500">
          Este carrinho está vazio. Use <strong className="text-tinta-700">Adicionar</strong> nas
          peças ao lado.
        </p>
      ) : (
        <ul className="divide-y divide-tinta-200 border-y border-tinta-200">
          {carrinho.itens.map((item) => (
            <ItemCompacto
              key={item.codigo_produto}
              item={item}
              ocupado={ocupado}
              aoAlterar={(codigo, quantidade) => agir(() => alterar(codigo, quantidade))}
              aoRemover={(codigo) => agir(() => remover(codigo))}
            />
          ))}
        </ul>
      )}

      {carrinho.itens.length > 0 && !carrinho.pronto_para_checkout && (
        <Alerta tipo="aviso">Ajuste ou remova os itens marcados para fechar o pedido.</Alerta>
      )}

      <dl className="flex items-baseline justify-between">
        <dt className="text-sm text-tinta-600">
          Total · {carrinho.quantidade_pecas} {carrinho.quantidade_pecas === 1 ? 'peça' : 'peças'}
        </dt>
        <dd className="text-xl font-bold text-tinta-900">{dinheiro.format(carrinho.valor_total)}</dd>
      </dl>

      <div className="space-y-2">
        {carrinho.pronto_para_checkout ? (
          <Link to="/checkout" onClick={aoNavegar} className="block">
            <Botao tamanho="grande" className="w-full">Fechar este pedido</Botao>
          </Link>
        ) : (
          <Botao tamanho="grande" className="w-full" disabled>Fechar este pedido</Botao>
        )}

        <Link
          to="/carrinho"
          onClick={aoNavegar}
          className="block text-center text-sm text-tinta-600 underline hover:text-marca-700"
        >
          Ver carrinho completo
        </Link>
      </div>
    </section>
  );
}

/**
 * Celular: o painel nao cabe ao lado da vitrine, entao vira um botao flutuante
 * que abre uma gaveta por baixo. A vitrine continua montada por tras, com a
 * rolagem e os filtros intactos.
 */
export function CarrinhoMovel() {
  const { carrinho } = useCarrinho();
  const [aberto, setAberto] = useState(false);
  const botaoRef = useRef(null);
  const gavetaRef = useRef(null);

  useEffect(() => {
    if (!aberto) return undefined;

    const gaveta = gavetaRef.current;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // a pagina nao rola por tras da gaveta

    const focaveis = () =>
      gaveta.querySelectorAll('a[href], button:not([disabled]), select:not([disabled]), input:not([disabled])');

    focaveis()[0]?.focus();

    function aoTeclar(evento) {
      if (evento.key === 'Escape') {
        setAberto(false);
        return;
      }

      // Tab fica preso dentro da gaveta enquanto ela esta aberta.
      if (evento.key === 'Tab') {
        const lista = focaveis();
        if (lista.length === 0) return;
        const primeiro = lista[0];
        const ultimo = lista[lista.length - 1];

        if (evento.shiftKey && document.activeElement === primeiro) {
          evento.preventDefault();
          ultimo.focus();
        } else if (!evento.shiftKey && document.activeElement === ultimo) {
          evento.preventDefault();
          primeiro.focus();
        }
      }
    }

    document.addEventListener('keydown', aoTeclar);
    const botao = botaoRef.current;

    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = anterior;
      botao?.focus(); // devolve o foco a quem abriu
    };
  }, [aberto]);

  const pecas = carrinho.quantidade_pecas;

  return (
    <div className="lg:hidden">
      <button
        ref={botaoRef}
        type="button"
        onClick={() => setAberto(true)}
        className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full bg-marca-700
          px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-marca-800"
      >
        Carrinho
        <span aria-hidden="true">·</span>
        <span>{pecas} {pecas === 1 ? 'peça' : 'peças'}</span>
        <span className="sr-only">no carrinho {carrinho.nome}</span>
      </button>

      {aberto && (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-tinta-900/50"
            onClick={() => setAberto(false)}
            aria-hidden="true"
          />

          <div
            ref={gavetaRef}
            role="dialog"
            aria-modal="true"
            aria-label="Seu carrinho"
            className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-2xl
              bg-white p-4 shadow-2xl"
          >
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-tinta-600 hover:bg-tinta-100"
              >
                Fechar
              </button>
            </div>

            <PainelCarrinho aoNavegar={() => setAberto(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
