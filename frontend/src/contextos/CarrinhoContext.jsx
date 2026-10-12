import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api } from '../api/cliente.js';
import { useAuth } from './AuthContext.jsx';

const CarrinhoContext = createContext(null);

const VAZIO = {
  id: null,
  nome: '',
  itens: [],
  quantidade_itens: 0,
  quantidade_pecas: 0,
  valor_total: 0,
  pronto_para_checkout: false,
  carrinhos: [],
  limite_carrinhos: 10,
};

/**
 * Os carrinhos moram no servidor, nao no localStorage: trocar de navegador ou
 * de celular mantem o que a pessoa montou (e qual carrinho estava ativo), e o
 * estoque e sempre conferido contra o ERP na hora de ler.
 *
 * `carrinho` e o estado completo devolvido pela API: o conteudo do carrinho
 * ATIVO (itens, total...) mais `carrinhos`, o resumo de todos.
 */
export function ProvedorCarrinho({ children }) {
  const { usuario, carregando: carregandoSessao } = useAuth();
  const usuarioId = usuario?.id ?? null;

  const [carrinho, setCarrinho] = useState(VAZIO);
  const [carregando, setCarregando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  // Cada chamada ganha um numero; so a MAIS RECENTE pode escrever no estado.
  // Resposta de outra conta, ou ultrapassada por uma mais nova (dois cliques
  // seguidos), nao sobrescreve o que a pessoa ve agora.
  const sequencia = useRef(0);
  const pendentes = useRef(0);

  // Id do carrinho que a tela esta mostrando. As acoes de item usam ESTE id (e
  // nao "o ativo do servidor"): se o ativo mudou em outra aba, o clique ainda
  // age no carrinho que a pessoa estava vendo, nunca em outro as escondidas.
  const idMostrado = useRef(null);
  idMostrado.current = carrinho.id;

  const recarregar = useCallback(async () => {
    const minha = ++sequencia.current;
    setCarregando(true);
    try {
      const resposta = await api.carrinhos.ler();
      if (minha === sequencia.current) setCarrinho(resposta.dados);
    } catch {
      // 401 quando nao ha sessao: segue com o carrinho vazio.
      if (minha === sequencia.current) setCarrinho(VAZIO);
    } finally {
      if (minha === sequencia.current) setCarregando(false);
    }
  }, []);

  // O carrinho acompanha a SESSAO, nao a abertura da pagina: entrou, carrega o
  // da conta; saiu ou trocou de conta, descarta o que estava na memoria. Sem
  // isto quem saia e entrava com outra conta na mesma aba via o carrinho da
  // anterior, e quem acabava de logar via o carrinho vazio ate dar F5.
  useEffect(() => {
    if (carregandoSessao) return;

    if (usuarioId === null) {
      sequencia.current += 1; // invalida qualquer chamada em andamento
      setCarrinho(VAZIO);
      setCarregando(false);
      return;
    }

    recarregar();
  }, [carregandoSessao, usuarioId, recarregar]);

  /**
   * Roda uma chamada que devolve o estado novo e o aplica. `ocupado` fica
   * ligado enquanto houver chamada pendente, para a tela travar os controles.
   */
  const executar = useCallback(
    async (chamada) => {
      const minha = ++sequencia.current;
      pendentes.current += 1;
      setOcupado(true);

      try {
        const resposta = await chamada();
        if (minha === sequencia.current) setCarrinho(resposta.dados);
        return resposta.dados;
      } catch (falha) {
        // O carrinho nao existe mais (apagado em outra aba ou aparelho): puxa o
        // estado real em vez de deixar a tela mostrando um carrinho fantasma.
        if (falha?.status === 404) recarregar();
        throw falha;
      } finally {
        pendentes.current -= 1;
        if (pendentes.current === 0) setOcupado(false);
      }
    },
    [recarregar],
  );

  const adicionar = useCallback(
    (codigo, quantidade = 1) =>
      executar(() => api.carrinhos.adicionar(idMostrado.current, codigo, quantidade)),
    [executar],
  );
  const alterar = useCallback(
    (codigo, quantidade) =>
      executar(() => api.carrinhos.alterar(idMostrado.current, codigo, quantidade)),
    [executar],
  );
  const remover = useCallback(
    (codigo) => executar(() => api.carrinhos.remover(idMostrado.current, codigo)),
    [executar],
  );
  const limpar = useCallback(
    () => executar(() => api.carrinhos.esvaziar(idMostrado.current)),
    [executar],
  );

  const criar = useCallback((nome) => executar(() => api.carrinhos.criar(nome)), [executar]);
  const renomear = useCallback(
    (nome) => executar(() => api.carrinhos.renomear(idMostrado.current, nome)),
    [executar],
  );
  const ativar = useCallback((id) => executar(() => api.carrinhos.ativar(id)), [executar]);
  const excluir = useCallback(
    () => executar(() => api.carrinhos.excluir(idMostrado.current)),
    [executar],
  );

  const valor = useMemo(
    () => ({
      carrinho,
      carregando,
      ocupado,
      recarregar,
      adicionar,
      alterar,
      remover,
      limpar,
      criar,
      renomear,
      ativar,
      excluir,
    }),
    [
      carrinho, carregando, ocupado, recarregar,
      adicionar, alterar, remover, limpar, criar, renomear, ativar, excluir,
    ],
  );

  return <CarrinhoContext.Provider value={valor}>{children}</CarrinhoContext.Provider>;
}

export function useCarrinho() {
  const contexto = useContext(CarrinhoContext);
  if (!contexto) throw new Error('useCarrinho precisa estar dentro de <ProvedorCarrinho>.');
  return contexto;
}
