import { useId, useState } from 'react';
import { useCarrinho } from '../contextos/CarrinhoContext.jsx';
import { Botao } from './ui.jsx';

const TAMANHO_MAXIMO_NOME = 40;

function textoPecas(quantidade) {
  return quantidade === 1 ? '1 peça' : `${quantidade} peças`;
}

/**
 * Escolhe e gerencia os carrinhos: trocar, criar, renomear, excluir.
 *
 * Renomear e excluir agem no carrinho que esta sendo MOSTRADO (o ativo): quem
 * gerencia um carrinho esta olhando para ele. Trocar de carrinho usa um
 * <select> nativo - acessivel por padrao, com o seletor do proprio celular.
 */
export function SeletorCarrinhos() {
  const { carrinho, ocupado, ativar, criar, renomear, excluir } = useCarrinho();
  const idSeletor = useId();
  const idNome = useId();

  // 'novo' | 'renomear' | 'excluir' | null: qual formulario esta aberto.
  const [modo, setModo] = useState(null);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState(null);

  const noLimite = carrinho.carrinhos.length >= carrinho.limite_carrinhos;
  const temItens = carrinho.itens.length > 0;

  function abrir(novoModo) {
    setErro(null);
    setNome(novoModo === 'renomear' ? carrinho.nome : '');
    setModo(novoModo);
  }

  function fechar() {
    setErro(null);
    setModo(null);
  }

  async function tentar(acao) {
    setErro(null);
    try {
      await acao();
      fechar();
    } catch (falha) {
      setErro(falha.porCampo?.nome ?? falha.message);
    }
  }

  function enviarNome(evento) {
    evento.preventDefault();
    const limpo = nome.trim();

    if (!limpo) {
      setErro('Dê um nome ao carrinho.');
      return;
    }

    tentar(() => (modo === 'novo' ? criar(limpo) : renomear(limpo)));
  }

  async function trocar(evento) {
    setErro(null);
    try {
      await ativar(Number(evento.target.value));
    } catch (falha) {
      setErro(falha.message);
    }
  }

  return (
    <div className="space-y-2">
      <div>
        <label htmlFor={idSeletor} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-tinta-500">
          Carrinho
        </label>
        <select
          id={idSeletor}
          value={carrinho.id ?? ''}
          onChange={trocar}
          disabled={ocupado || carrinho.carrinhos.length === 0}
          className="w-full rounded-lg border border-tinta-300 bg-white px-3 py-2 text-sm font-medium
            text-tinta-900 focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-100
            disabled:bg-tinta-100"
        >
          {carrinho.carrinhos.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nome} · {textoPecas(item.quantidade_pecas)}
            </option>
          ))}
        </select>
      </div>

      {modo === null && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <button
            type="button"
            onClick={() => abrir('novo')}
            disabled={ocupado || noLimite}
            title={noLimite ? `Limite de ${carrinho.limite_carrinhos} carrinhos` : undefined}
            className="font-medium text-marca-700 underline hover:text-marca-800
              disabled:cursor-not-allowed disabled:text-tinta-500 disabled:no-underline"
          >
            Novo carrinho
          </button>
          <button
            type="button"
            onClick={() => abrir('renomear')}
            disabled={ocupado || !carrinho.id}
            className="text-tinta-600 underline hover:text-tinta-900 disabled:opacity-50"
          >
            Renomear
          </button>
          <button
            type="button"
            onClick={() => abrir('excluir')}
            disabled={ocupado || !carrinho.id}
            className="text-tinta-600 underline hover:text-red-700 disabled:opacity-50"
          >
            Excluir
          </button>
        </div>
      )}

      {modo === null && noLimite && (
        <p className="text-xs text-tinta-500">
          Você chegou ao limite de {carrinho.limite_carrinhos} carrinhos. Exclua um para criar outro.
        </p>
      )}

      {(modo === 'novo' || modo === 'renomear') && (
        <form onSubmit={enviarNome} className="space-y-2" noValidate>
          <label htmlFor={idNome} className="block text-sm font-medium text-tinta-700">
            {modo === 'novo' ? 'Nome do novo carrinho' : 'Novo nome do carrinho'}
          </label>
          <input
            id={idNome}
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            maxLength={TAMANHO_MAXIMO_NOME}
            placeholder="Ex.: Gol do João"
            autoFocus
            aria-invalid={erro ? 'true' : undefined}
            className="w-full rounded-lg border border-tinta-300 px-3 py-2 text-sm
              focus:border-marca-500 focus:outline-none focus:ring-2 focus:ring-marca-100"
          />
          <div className="flex gap-2">
            <Botao type="submit" tamanho="pequeno" carregando={ocupado}>
              {modo === 'novo' ? 'Criar' : 'Salvar'}
            </Botao>
            <Botao type="button" tamanho="pequeno" variante="contorno" onClick={fechar}>
              Cancelar
            </Botao>
          </div>
        </form>
      )}

      {modo === 'excluir' && (
        <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <p>
            Excluir <strong>{carrinho.nome}</strong>
            {temItens ? ` e ${textoPecas(carrinho.quantidade_pecas)}` : ''}? Não dá para desfazer.
          </p>
          <div className="flex gap-2">
            <Botao
              type="button"
              tamanho="pequeno"
              variante="perigo"
              carregando={ocupado}
              onClick={() => tentar(excluir)}
            >
              Excluir carrinho
            </Botao>
            <Botao type="button" tamanho="pequeno" variante="contorno" onClick={fechar}>
              Cancelar
            </Botao>
          </div>
        </div>
      )}

      {erro && (
        <p role="alert" className="text-sm text-red-700">
          {erro}
        </p>
      )}
    </div>
  );
}
