/**
 * Infraestrutura dos testes.
 *
 * - ERP FALSO em memoria: os testes nunca falam com o ERP de verdade nem criam
 *   pedido real. O estoque baixa de verdade, entao da para testar "dois
 *   checkouts ao mesmo tempo" de ponta a ponta.
 * - Banco SQLite em pasta temporaria, novo a cada arquivo de teste.
 * - Cliente HTTP com cookie, para agir como uma pessoa logada.
 *
 * O config.js le o process.env uma vez, ao ser importado. Por isso o ambiente
 * e preparado ANTES de importar o app (import dinamico dentro da funcao).
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

export const TOKEN_ERP = 'token-de-teste-do-erp-falso';

function produtosIniciais() {
  const base = { marca: 'Teste', categoria: 'Motor', aplicacao: 'Universal', imagem_url: '/imagens/generico.svg' };
  return [
    { ...base, codigo: 'PEC-001', descricao: 'Filtro de oleo', preco_unitario: 10.1, estoque: 20, ativo: true },
    { ...base, codigo: 'PEC-002', descricao: 'Pastilha de freio', preco_unitario: 25.5, estoque: 5, ativo: true },
    { ...base, codigo: 'PEC-003', descricao: 'Correia dentada', preco_unitario: 99.99, estoque: 3, ativo: true },
    { ...base, codigo: 'SEM-EST', descricao: 'Item sem estoque', preco_unitario: 500, estoque: 0, ativo: true },
    { ...base, codigo: 'FORA-LN', descricao: 'Item fora de linha', preco_unitario: 40, estoque: 9, ativo: false },
  ];
}

function criarErpFalso() {
  const estado = {
    produtos: new Map(),
    pedidos: new Map(),
    pedidosCriados: [],
    atrasoPedidoMs: 0,
    falharPedido: false,
    // Nao zera no reiniciar(): o ERP de verdade nunca repete numero de pedido.
    sequencia: 0,
  };

  function reiniciar() {
    estado.produtos = new Map(produtosIniciais().map((p) => [p.codigo, p]));
    estado.pedidos = new Map();
    estado.pedidosCriados = [];
    estado.atrasoPedidoMs = 0;
    estado.falharPedido = false;
  }
  reiniciar();

  const json = (res, status, corpo) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(corpo));
  };

  const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://erp.falso');
    const { pathname } = url;

    if (pathname === '/health') return json(res, 200, { status: 'ok' });

    if (pathname.startsWith('/imagens/')) {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      return res.end('<svg xmlns="http://www.w3.org/2000/svg"/>');
    }

    if (req.headers['x-api-token'] !== TOKEN_ERP) {
      return json(res, 401, { erro: { codigo: 'NAO_AUTORIZADO', mensagem: 'Token invalido.' } });
    }

    const partes = pathname.split('/').filter(Boolean);

    if (req.method === 'GET' && partes[0] === 'produtos' && partes.length === 2) {
      const produto = estado.produtos.get(decodeURIComponent(partes[1]));
      if (!produto) return json(res, 404, { erro: { codigo: 'PRODUTO_NAO_ENCONTRADO', mensagem: 'Produto nao encontrado.' } });
      return json(res, 200, { dados: produto });
    }

    if (req.method === 'GET' && partes[0] === 'pedidos' && partes.length === 2) {
      const pedido = estado.pedidos.get(partes[1]);
      if (!pedido) return json(res, 404, { erro: { codigo: 'PEDIDO_NAO_ENCONTRADO', mensagem: 'Pedido nao encontrado.' } });
      return json(res, 200, { dados: pedido });
    }

    if (req.method === 'POST' && pathname === '/pedidos') {
      let texto = '';
      for await (const pedaco of req) texto += pedaco;
      const corpo = JSON.parse(texto);

      if (estado.atrasoPedidoMs) await new Promise((ok) => setTimeout(ok, estado.atrasoPedidoMs));
      if (estado.falharPedido) return json(res, 500, { erro: { codigo: 'ERRO_INTERNO', mensagem: 'Falha.' } });

      // Confere tudo antes de baixar qualquer estoque (como o ERP de verdade faz).
      for (const item of corpo.itens) {
        const produto = estado.produtos.get(item.codigo_produto);
        if (!produto || produto.estoque < item.quantidade) {
          return json(res, 409, { erro: { codigo: 'ESTOQUE_INSUFICIENTE', mensagem: `Sem estoque: ${item.codigo_produto}` } });
        }
      }

      let totalCentavos = 0;
      for (const item of corpo.itens) {
        const produto = estado.produtos.get(item.codigo_produto);
        produto.estoque -= item.quantidade;
        totalCentavos += Math.round(produto.preco_unitario * 100) * item.quantidade;
      }

      estado.sequencia += 1;
      const numero = `PED-${String(estado.sequencia).padStart(4, '0')}`;
      const pedido = {
        numero,
        situacao: 'ABERTO',
        valor_total: totalCentavos / 100,
        quantidade_itens: corpo.itens.length,
        observacao: corpo.observacao,
      };
      estado.pedidos.set(numero, pedido);
      estado.pedidosCriados.push({ ...pedido, itens: corpo.itens });
      return json(res, 201, { dados: pedido });
    }

    return json(res, 404, { erro: { codigo: 'ROTA_NAO_ENCONTRADA', mensagem: 'Rota inexistente.' } });
  });

  return {
    estado,
    reiniciar,
    iniciar: () => new Promise((ok) => servidor.listen(0, '127.0.0.1', ok)),
    parar: () => new Promise((ok) => servidor.close(ok)),
    get url() {
      return `http://127.0.0.1:${servidor.address().port}`;
    },
  };
}

/** Pessoa navegando: guarda o cookie de sessao entre as chamadas. */
export function criarCliente(base) {
  let cookie = '';

  async function requisitar(metodo, caminho, corpo, cabecalhos = {}) {
    const resposta = await fetch(base + caminho, {
      method: metodo,
      headers: {
        ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...cabecalhos,
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });

    const definidos = resposta.headers.getSetCookie?.() ?? [];
    if (definidos.length > 0) cookie = definidos.map((c) => c.split(';')[0]).join('; ');

    const texto = await resposta.text();
    let dados = null;
    try { dados = texto ? JSON.parse(texto) : null; } catch { dados = texto; }

    return { status: resposta.status, corpo: dados, cabecalhos: resposta.headers };
  }

  return {
    get: (c, h) => requisitar('GET', c, undefined, h),
    post: (c, corpo = {}, h) => requisitar('POST', c, corpo, h),
    patch: (c, corpo = {}) => requisitar('PATCH', c, corpo),
    put: (c, corpo = {}) => requisitar('PUT', c, corpo),
    delete: (c) => requisitar('DELETE', c),
  };
}

let contador = 0;

export async function iniciarAmbiente() {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'kaizen-teste-'));
  const erp = criarErpFalso();
  await erp.iniciar();

  Object.assign(process.env, {
    NODE_ENV: 'test',
    DB_PATH: path.join(pasta, 'teste.db'),
    ERP_URL: erp.url,
    ERP_TOKEN: TOKEN_ERP,
    ERP_TIMEOUT_MS: '5000',
    JWT_SEGREDO: 'segredo-so-para-teste-com-mais-de-32-caracteres',
    CORS_ORIGEM: 'http://localhost:5173',
  });

  const { criarApp } = await import('../src/app.js');
  const bancoModulo = await import('../src/db/index.js');
  bancoModulo.aplicarSchema(bancoModulo.obterBanco());

  const servidor = await new Promise((ok) => {
    const s = criarApp().listen(0, '127.0.0.1', () => ok(s));
  });
  const base = `http://127.0.0.1:${servidor.address().port}`;

  /** Cria uma conta nova ja logada. */
  async function novaPessoa(nome = 'Pessoa Teste') {
    contador += 1;
    const cliente = criarCliente(base);
    const r = await cliente.post('/api/auth/cadastro', {
      nome,
      email: `pessoa${contador}@exemplo.com`,
      senha: 'senha1234',
      documento: '12345678901',
    });
    if (r.status !== 201) throw new Error(`cadastro falhou: ${JSON.stringify(r.corpo)}`);
    return Object.assign(cliente, { usuario: r.corpo.dados });
  }

  async function novoEndereco(cliente, extra = {}) {
    const r = await cliente.post('/api/enderecos', {
      apelido: 'Casa', cep: '01001-000', logradouro: 'Rua das Flores', numero: '10',
      bairro: 'Centro', cidade: 'Sao Paulo', uf: 'SP', ...extra,
    });
    if (r.status !== 201) throw new Error(`endereco falhou: ${JSON.stringify(r.corpo)}`);
    return r.corpo.dados;
  }

  return {
    base,
    erp,
    banco: bancoModulo.obterBanco(),
    novaPessoa,
    novoEndereco,
    anonimo: () => criarCliente(base),
    async encerrar() {
      servidor.closeAllConnections?.();
      await new Promise((ok) => servidor.close(ok));
      bancoModulo.fecharBanco();
      await erp.parar();
      fs.rmSync(pasta, { recursive: true, force: true });
    },
  };
}
