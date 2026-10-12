import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/cliente.js';
import { useAuth } from '../contextos/AuthContext.jsx';
import { useCarrinho } from '../contextos/CarrinhoContext.jsx';
import { CardProduto } from '../componentes/CardProduto.jsx';
import { CarrinhoMovel, PainelCarrinho } from '../componentes/PainelCarrinho.jsx';
import { Alerta, Botao, Carregando, EstadoVazio, Paginacao } from '../componentes/ui.jsx';

const CHAVE_PAINEL = 'kaizen.painel-carrinho';

/** Preferencia por aparelho; se o navegador bloquear o storage, segue aberto. */
function lerPainelAberto() {
  try {
    return window.localStorage.getItem(CHAVE_PAINEL) !== 'fechado';
  } catch {
    return true;
  }
}

function guardarPainelAberto(aberto) {
  try {
    window.localStorage.setItem(CHAVE_PAINEL, aberto ? 'aberto' : 'fechado');
  } catch {
    // Sem storage: a preferencia vale so ate recarregar a pagina.
  }
}

/**
 * Os filtros vivem na URL (?busca=&categoria=&pagina=), nao no estado do
 * componente. Assim o link e compartilhavel, o botao voltar do navegador
 * funciona e um F5 nao perde a pesquisa.
 */
export function Catalogo() {
  const [parametros, setParametros] = useSearchParams();
  const { autenticado } = useAuth();
  const { adicionar, carrinho } = useCarrinho();
  const [painelAberto, setPainelAberto] = useState(lerPainelAberto);
  const navegar = useNavigate();

  const [produtos, setProdutos] = useState([]);
  const [paginacao, setPaginacao] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [adicionandoCodigo, setAdicionandoCodigo] = useState(null);
  const [recado, setRecado] = useState(null);

  const busca = parametros.get('busca') ?? '';
  const categoria = parametros.get('categoria') ?? '';
  const pagina = Number(parametros.get('pagina') ?? '1');
  const somenteDisponiveis = parametros.get('somente_disponiveis') === 'true';

  useEffect(() => {
    api.catalogo
      .categorias()
      .then((resposta) => setCategorias(resposta.dados))
      .catch(() => setCategorias([]));
  }, []);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro(null);

    api.catalogo
      .listar({
        busca,
        categoria,
        pagina,
        tamanho: 24,
        somente_disponiveis: somenteDisponiveis ? 'true' : undefined,
      })
      .then((resposta) => {
        if (!ativo) return;
        setProdutos(resposta.dados);
        setPaginacao(resposta.paginacao);
      })
      .catch((falha) => {
        if (ativo) setErro(falha);
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });

    return () => {
      ativo = false;
    };
  }, [busca, categoria, pagina, somenteDisponiveis]);

  const trocarParametro = useCallback(
    (chave, valor) => {
      const proximos = new URLSearchParams(parametros);

      if (valor === null || valor === '' || valor === false) proximos.delete(chave);
      else proximos.set(chave, String(valor));

      // Mudou busca, categoria ou filtro: volta para a primeira pagina. A pagina
      // N da listagem antiga nao existe na nova (KZN-325: "amortecedor" tem uma
      // pagina so, e a URL ainda pedia a 5).
      if (chave !== 'pagina') proximos.delete('pagina');

      setParametros(proximos);
    },
    [parametros, setParametros],
  );

  // Link antigo ou compartilhado com pagina alem do fim: vai para a ultima que
  // existe, em vez de dizer "nenhuma peca" quando ha resultados.
  useEffect(() => {
    if (carregando || !paginacao) return;

    if (paginacao.total > 0 && pagina > paginacao.total_paginas) {
      const proximos = new URLSearchParams(parametros);
      if (paginacao.total_paginas > 1) proximos.set('pagina', String(paginacao.total_paginas));
      else proximos.delete('pagina');
      setParametros(proximos, { replace: true });
    }
  }, [carregando, paginacao, pagina, parametros, setParametros]);

  function alternarPainel(aberto) {
    setPainelAberto(aberto);
    guardarPainelAberto(aberto);
  }

  async function adicionarAoCarrinho(produto) {
    if (!autenticado) {
      navegar('/entrar', { state: { de: '/' } });
      return;
    }

    setAdicionandoCodigo(produto.codigo);
    setRecado(null);

    try {
      const estado = await adicionar(produto.codigo, 1);
      // Diz EM QUAL carrinho caiu: com varios, "foi para o carrinho" nao basta.
      setRecado({
        tipo: 'sucesso',
        texto: `${produto.descricao} foi para o carrinho "${estado.nome}".`,
      });
    } catch (falha) {
      setRecado({ tipo: 'erro', texto: falha.message });
    } finally {
      setAdicionandoCodigo(null);
    }
  }

  // Painel lateral so para quem tem sessao (carrinho e por conta) e so no desktop;
  // no celular o carrinho vira o botao flutuante (CarrinhoMovel).
  const mostrarPainel = autenticado && painelAberto;

  return (
    <div
      className={
        mostrarPainel ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6' : ''
      }
    >
      <div className="min-w-0 space-y-6 pb-24 lg:pb-0">
        {/* Gradiente comeca no marca-700, nao no #00a5ac puro: o subtitulo tem
            14px e precisa de 4.5:1, e a cor da marca so entrega 3.01:1 com
            branco. O #00a5ac vive no logo, nos icones e nos estados de foco. */}
        <div className="rounded-xl bg-linear-to-br from-marca-700 to-marca-900 px-6 py-8
          text-white sm:px-10 sm:py-12">
          <h1 className="text-2xl font-bold sm:text-3xl">Peças para o seu carro</h1>
          <p className="mt-2 max-w-xl text-sm text-marca-100">
            Catálogo direto do nosso estoque. Freios, suspensão, motor, filtros, elétrica e mais.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => trocarParametro('categoria', '')}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              categoria === ''
                ? 'bg-tinta-900 text-white'
                : 'border border-tinta-300 bg-white text-tinta-600 hover:bg-tinta-100'
            }`}
          >
            Todas
          </button>

          {categorias.map((nome) => (
            <button
              key={nome}
              type="button"
              onClick={() => trocarParametro('categoria', nome)}
              className={`rounded-full px-4 py-2 text-sm font-medium capitalize transition-colors ${
                categoria === nome
                  ? 'bg-tinta-900 text-white'
                  : 'border border-tinta-300 bg-white text-tinta-600 hover:bg-tinta-100'
              }`}
            >
              {nome.toLowerCase()}
            </button>
          ))}

          <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-tinta-600">
            <input
              type="checkbox"
              checked={somenteDisponiveis}
              onChange={(evento) => trocarParametro('somente_disponiveis', evento.target.checked)}
              className="size-4 rounded border-tinta-300 text-marca-700 focus:ring-marca-500"
            />
            Só com estoque
          </label>

          {autenticado && !painelAberto && (
            <button
              type="button"
              onClick={() => alternarPainel(true)}
              className="hidden rounded-full border border-tinta-300 bg-white px-4 py-2 text-sm
                font-medium text-tinta-700 hover:bg-tinta-100 lg:inline-flex"
            >
              Mostrar carrinho ({carrinho.quantidade_pecas})
            </button>
          )}
        </div>

        {busca && (
          <p className="text-sm text-tinta-600">
            Resultados para <strong className="text-tinta-900">"{busca}"</strong>
            <button
              type="button"
              onClick={() => trocarParametro('busca', '')}
              className="ml-2 text-marca-700 underline hover:text-marca-800"
            >
              limpar
            </button>
          </p>
        )}

        {recado && <Alerta tipo={recado.tipo}>{recado.texto}</Alerta>}
        {erro && <Alerta tipo="erro" titulo="Não foi possível carregar o catálogo">{erro.message}</Alerta>}

        {carregando ? (
          <Carregando texto="Buscando peças..." />
        ) : produtos.length === 0 ? (
          <EstadoVazio
            titulo="Nenhuma peça encontrada"
            descricao="Tente outro termo de busca ou remova os filtros."
            acao={
              <Botao variante="contorno" onClick={() => setParametros(new URLSearchParams())}>
                Limpar filtros
              </Botao>
            }
          />
        ) : (
          <>
            {/* Antes era grid-cols-4 fixo: no celular cada card ficava com ~80px.
                Com o painel aberto sobra menos largura, entao uma coluna a menos. */}
            <div
              className={`grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 ${
                mostrarPainel ? '' : 'lg:grid-cols-4'
              }`}
            >
              {produtos.map((produto) => (
                <CardProduto
                  key={produto.codigo}
                  produto={produto}
                  aoAdicionar={adicionarAoCarrinho}
                  adicionando={adicionandoCodigo === produto.codigo}
                />
              ))}
            </div>

            <Paginacao paginacao={paginacao} aoMudar={(nova) => trocarParametro('pagina', nova)} />
          </>
        )}
      </div>

      {mostrarPainel && (
        <aside
          aria-label="Carrinho"
          className="mt-6 hidden rounded-xl border border-tinta-200 bg-white p-4 lg:sticky lg:top-24
            lg:mt-0 lg:block lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto"
        >
          <PainelCarrinho aoRecolher={() => alternarPainel(false)} />
        </aside>
      )}

      {autenticado && <CarrinhoMovel />}
    </div>
  );
}
