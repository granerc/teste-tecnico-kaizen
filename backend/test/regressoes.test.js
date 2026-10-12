import assert from 'node:assert/strict';
import { after, afterEach, before, describe, test } from 'node:test';
import { iniciarAmbiente } from './ajudas.js';

let amb;
before(async () => { amb = await iniciarAmbiente(); });
after(async () => { await amb.encerrar(); });
afterEach(() => amb.erp.reiniciar());

describe('KZN-318: contador do carrinho conta PECAS, nao linhas', () => {
  test('2 de um produto + 5 de outro = 7 pecas em 2 linhas', async () => {
    const ana = await amb.novaPessoa();
    await ana.post('/api/carrinho/itens', { codigo_produto: 'PEC-001', quantidade: 2 });
    const r = await ana.post('/api/carrinho/itens', { codigo_produto: 'PEC-002', quantidade: 5 });

    assert.equal(r.corpo.dados.quantidade_itens, 2);
    assert.equal(r.corpo.dados.quantidade_pecas, 7);
  });
});

describe('KZN-312: total ignora o que nao da para comprar', () => {
  test('item sem estoque continua visivel, com motivo, mas fora do total', async () => {
    const ana = await amb.novaPessoa();
    await ana.post('/api/carrinho/itens', { codigo_produto: 'PEC-001', quantidade: 2 }); // 20.20
    await ana.post('/api/carrinho/itens', { codigo_produto: 'PEC-003', quantidade: 2 }); // 199.98
    amb.erp.estado.produtos.get('PEC-003').estoque = 0; // acabou depois

    const { dados } = (await ana.get('/api/carrinho')).corpo;
    const sem = dados.itens.find((i) => i.codigo_produto === 'PEC-003');

    assert.equal(sem.disponivel, false);
    assert.match(sem.problema, /estoque/i);
    assert.equal(dados.valor_total, 20.2);
    assert.equal(dados.pronto_para_checkout, false);
  });

  test('estoque parcial (menos do que a quantidade) tambem fica fora do total', async () => {
    const ana = await amb.novaPessoa();
    await ana.post('/api/carrinho/itens', { codigo_produto: 'PEC-002', quantidade: 4 });
    amb.erp.estado.produtos.get('PEC-002').estoque = 2;

    const { dados } = (await ana.get('/api/carrinho')).corpo;
    assert.equal(dados.itens[0].disponivel, false);
    assert.equal(dados.valor_total, 0);
  });

  test('soma em centavos: 3 x 10,10 + 1 x 99,99 = 130,29 exato', async () => {
    const ana = await amb.novaPessoa();
    await ana.post('/api/carrinho/itens', { codigo_produto: 'PEC-001', quantidade: 3 });
    const r = await ana.post('/api/carrinho/itens', { codigo_produto: 'PEC-003', quantidade: 1 });
    assert.equal(r.corpo.dados.valor_total, 130.29);
  });
});

describe('arredondamento de dinheiro', () => {
  test('paraCentavos nao perde centavo em ponto flutuante', async () => {
    const { paraCentavos, paraReais } = await import('../src/lib/dinheiro.js');
    assert.equal(paraCentavos(312.4), 31240); // 312.4 * 100 = 31239.999999999996
    assert.equal(paraCentavos(19.99), 1999);
    assert.equal(paraCentavos(0.07), 7);
    assert.equal(paraReais(paraCentavos(1475.93)), 1475.93);
  });
});

describe('endereco e perfil: campo ausente nao apaga dado', () => {
  const corpoEndereco = {
    apelido: 'Casa', cep: '01001-000', logradouro: 'Rua A', numero: '1',
    bairro: 'Centro', cidade: 'Sao Paulo', uf: 'SP',
  };

  test('PUT sem "principal" mantem o endereco principal', async () => {
    const ana = await amb.novaPessoa();
    const e = await amb.novoEndereco(ana, { principal: true });
    assert.equal(e.principal, true);

    const r = await ana.put(`/api/enderecos/${e.id}`, { ...corpoEndereco, numero: '99' });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.dados.principal, true);
    assert.equal(r.corpo.dados.numero, '99');
  });

  test('PATCH de perfil sem "telefone" mantem; com texto vazio apaga', async () => {
    const ana = await amb.novaPessoa();
    const base = { nome: 'Ana Souza', documento: '12345678901' };

    await ana.patch('/api/perfil', { ...base, telefone: '(11) 91234-5678' });
    let r = await ana.patch('/api/perfil', base);
    assert.ok(r.corpo.dados.telefone, 'ausente = nao mexe');

    r = await ana.patch('/api/perfil', { ...base, telefone: '' });
    assert.equal(r.corpo.dados.telefone, null);
  });
});

describe('seguranca', () => {
  test('CORS: origem de terceiro nao recebe permissao com cookie', async () => {
    const r = await amb.anonimo().get('/api/health', { Origin: 'https://site-malicioso.example' });
    assert.equal(r.cabecalhos.get('access-control-allow-origin'), null);
  });

  test('CORS: a origem configurada continua autorizada', async () => {
    const r = await amb.anonimo().get('/api/health', { Origin: 'http://localhost:5173' });
    assert.equal(r.cabecalhos.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.equal(r.cabecalhos.get('access-control-allow-credentials'), 'true');
  });

  test('imagens saem com nosniff e CSP sandbox (SVG nao executa na origem da loja)', async () => {
    const r = await amb.anonimo().get('/api/imagens/generico.svg');
    assert.equal(r.status, 200);
    assert.equal(r.cabecalhos.get('x-content-type-options'), 'nosniff');
    assert.match(r.cabecalhos.get('content-security-policy'), /sandbox/);
  });

  test('cookie de sessao e httpOnly', async () => {
    const r = await fetch(`${amb.base}/api/auth/cadastro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: 'Cookie Teste', email: 'cookie@exemplo.com', senha: 'senha1234', documento: '12345678901',
      }),
    });
    assert.match(r.headers.getSetCookie().join(';'), /HttpOnly/i);
  });

  test('nao ve pedido de outra pessoa (404)', async () => {
    const ana = await amb.novaPessoa();
    const bia = await amb.novaPessoa();
    const endereco = await amb.novoEndereco(ana);
    await ana.post('/api/carrinho/itens', { codigo_produto: 'PEC-001' });
    const { dados } = (await ana.post('/api/pedidos', { endereco_id: endereco.id })).corpo;

    assert.equal((await bia.get(`/api/pedidos/${dados.numero}`)).status, 404);
    assert.equal((await ana.get(`/api/pedidos/${dados.numero}`)).status, 200);
  });
});
