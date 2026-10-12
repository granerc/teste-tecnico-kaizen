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
  itens: [],
  quantidade_itens: 0,
  quantidade_pecas: 0,
  valor_total: 0,
  pronto_para_checkout: false,
};

/**
 * O carrinho mora no servidor, nao no localStorage: trocar de navegador ou de
 * celular mantem o que a pessoa escolheu, e o estoque e sempre conferido
 * contra o ERP na hora de ler.
 */
export function ProvedorCarrinho({ children }) {
  const { usuario, carregando: carregandoSessao } = useAuth();
  const usuarioId = usuario?.id ?? null;

  const [carrinho, setCarrinho] = useState(VAZIO);
  const [carregando, setCarregando] = useState(false);

  // Resposta de uma leitura antiga (de outra conta, ou ultrapassada por uma
  // mais nova) nao pode sobrescrever o estado atual.
  const leituraAtual = useRef(0);

  const recarregar = useCallback(async () => {
    const minha = ++leituraAtual.current;
    setCarregando(true);
    try {
      const resposta = await api.carrinho.ler();
      if (minha === leituraAtual.current) setCarrinho(resposta.dados);
    } catch {
      // 401 quando nao ha sessao: segue com o carrinho vazio.
      if (minha === leituraAtual.current) setCarrinho(VAZIO);
    } finally {
      if (minha === leituraAtual.current) setCarregando(false);
    }
  }, []);

  // O carrinho acompanha a SESSAO, nao a abertura da pagina: entrou, carrega o
  // da conta; saiu ou trocou de conta, descarta o que estava na memoria. Sem
  // isto quem saia e entrava com outra conta na mesma aba via o carrinho da
  // anterior, e quem acabava de logar via o carrinho vazio ate dar F5.
  useEffect(() => {
    if (carregandoSessao) return;

    if (usuarioId === null) {
      leituraAtual.current += 1; // invalida leitura em andamento
      setCarrinho(VAZIO);
      setCarregando(false);
      return;
    }

    recarregar();
  }, [carregandoSessao, usuarioId, recarregar]);

  const adicionar = useCallback(async (codigo, quantidade = 1) => {
    const resposta = await api.carrinho.adicionar(codigo, quantidade);
    setCarrinho(resposta.dados);
  }, []);

  const alterar = useCallback(async (codigo, quantidade) => {
    const resposta = await api.carrinho.alterar(codigo, quantidade);
    setCarrinho(resposta.dados);
  }, []);

  const remover = useCallback(async (codigo) => {
    const resposta = await api.carrinho.remover(codigo);
    setCarrinho(resposta.dados);
  }, []);

  const limpar = useCallback(async () => {
    const resposta = await api.carrinho.limpar();
    setCarrinho(resposta.dados);
  }, []);

  const valor = useMemo(
    () => ({ carrinho, carregando, recarregar, adicionar, alterar, remover, limpar, setCarrinho }),
    [carrinho, carregando, recarregar, adicionar, alterar, remover, limpar],
  );

  return <CarrinhoContext.Provider value={valor}>{children}</CarrinhoContext.Provider>;
}

export function useCarrinho() {
  const contexto = useContext(CarrinhoContext);
  if (!contexto) throw new Error('useCarrinho precisa estar dentro de <ProvedorCarrinho>.');
  return contexto;
}
