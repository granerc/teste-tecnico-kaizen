import assert from 'node:assert/strict';
import { after, afterEach, before, describe, test } from 'node:test';
import { iniciarAmbiente } from './ajudas.js';

let amb;
before(async () => { amb = await iniciarAmbiente(); });
after(async () => { await amb.encerrar(); });
afterEach(() => amb.erp.reiniciar());

const nomes = (estado) => estado.carrinhos.map((c) => c.nome);
const ativos = (estado) => estado.carrinhos.filter((c) => c.ativo);
const porNome = (estado, nome) => estado.carrinhos.find((c) => c.nome === nome);

describe('carrinho inicial', () => {
  test('conta nova ganha um "Meu carrinho" ativo e vazio', async () => {
    const ana = await amb.novaPessoa();
    const r = await ana.get('/api/carrinhos');

    assert.equal(r.status, 200);
    assert.deepEqual(nomes(r.corpo.dados), ['Meu carrinho']);
    assert.equal(ativos(r.corpo.dados).length, 1);
    assert.equal(r.corpo.dados.nome, 'Meu carrinho');
    assert.equal(r.corpo.dados.itens.length, 0);
  });

  test('exige sessao', async () => {
    const r = await amb.anonimo().get('/api/carrinhos');
    assert.equal(r.status, 401);
  });
});

describe('criar, nomear e trocar', () => {
  test('criar ja ativa o novo e desativa o anterior (sempre um so ativo)', async () => {
    const ana = await amb.novaPessoa();
    const r = await ana.post('/api/carrinhos', { nome: 'Gol do Joao' });

    assert.equal(r.status, 201);
    assert.deepEqual(nomes(r.corpo.dados), ['Meu carrinho', 'Gol do Joao']);
    assert.equal(ativos(r.corpo.dados).length, 1);
    assert.equal(r.corpo.dados.nome, 'Gol do Joao');
  });

  test('nome repetido (ignorando maiusculas) e recusado com 409', async () => {
    const ana = await amb.novaPessoa();
    await ana.post('/api/carrinhos', { nome: 'Civic prata' });
    const r = await ana.post('/api/carrinhos', { nome: 'CIVIC PRATA' });

    assert.equal(r.status, 409);
    assert.equal(r.corpo.erro.codigo, 'NOME_EM_USO');
  });

  test('duas pessoas podem usar o mesmo nome', async () => {
    const ana = await amb.novaPessoa();
    const bia = await amb.novaPessoa();
    assert.equal((await ana.post('/api/carrinhos', { nome: 'Oficina' })).status, 201);
    assert.equal((await bia.post('/api/carrinhos', { nome: 'Oficina' })).status, 201);
  });

  test('nome vazio, so espacos ou grande demais da 422 com o campo', async () => {
    const ana = await amb.novaPessoa();

    for (const nome of ['', '   ', 'x'.repeat(41), 123, undefined]) {
      const r = await ana.post('/api/carrinhos', { nome });
      assert.equal(r.status, 422, `nome=${JSON.stringify(nome)}`);
      assert.equal(r.corpo.erro.detalhes[0].campo, 'nome');
    }
  });

  test('limite de 10 carrinhos por pessoa', async () => {
    const ana = await amb.novaPessoa();

    for (let i = 2; i <= 10; i += 1) {
      assert.equal((await ana.post('/api/carrinhos', { nome: `Carrinho ${i}` })).status, 201);
    }

    const r = await ana.post('/api/carrinhos', { nome: 'Carrinho 11' });
    assert.equal(r.status, 409);
    assert.equal(r.corpo.erro.codigo, 'LIMITE_DE_CARRINHOS');

    // Apagar um libera espaco.
    const estado = (await ana.get('/api/carrinhos')).corpo.dados;
    await ana.delete(`/api/carrinhos/${porNome(estado, 'Carrinho 5').id}`);
    assert.equal((await ana.post('/api/carrinhos', { nome: 'Carrinho 11' })).status, 201);
  });

  test('renomear; nao deixa renomear para um nome que ja existe', async () => {
    const ana = await amb.novaPessoa();
    await ana.post('/api/carrinhos', { nome: 'A' });
    const estado = (await ana.post('/api/carrinhos', { nome: 'B' })).corpo.dados;

    const b = porNome(estado, 'B');
    const ok = await ana.patch(`/api/carrinhos/${b.id}`, { nome: 'Bravo' });
    assert.equal(ok.status, 200);
    assert.ok(porNome(ok.corpo.dados, 'Bravo'));

    const repetido = await ana.patch(`/api/carrinhos/${b.id}`, { nome: 'a' });
    assert.equal(repetido.status, 409);

    // Renomear para o PROPRIO nome (so mudando a caixa) e permitido.
    const mesmo = await ana.patch(`/api/carrinhos/${b.id}`, { nome: 'BRAVO' });
    assert.equal(mesmo.status, 200);
  });

  test('trocar o carrinho ativo muda o conteudo mostrado', async () => {
    const ana = await amb.novaPessoa();
    await ana.post('/api/carrinho/itens', { codigo_produto: 'PEC-001', quantidade: 2 });
    const estado = (await ana.post('/api/carrinhos', { nome: 'Outro' })).corpo.dados;

    assert.equal(estado.itens.length, 0, 'o novo carrinho comeca vazio');

    const padrao = porNome(estado, 'Meu carrinho');
    const r = await ana.post(`/api/carrinhos/${padrao.id}/ativar`);

    assert.equal(r.status, 200);
    assert.equal(r.corpo.dados.nome, 'Meu carrinho');
    assert.equal(r.corpo.dados.itens[0].codigo_produto, 'PEC-001');
    assert.equal(ativos(r.corpo.dados).length, 1);

    // Idempotente.
    assert.equal((await ana.post(`/api/carrinhos/${padrao.id}/ativar`)).status, 200);
  });
});

describe('excluir', () => {
  test('excluir um carrinho que NAO e o ativo nao mexe no ativo', async () => {
    const ana = await amb.novaPessoa();
    const antigo = porNome((await ana.get('/api/carrinhos')).corpo.dados, 'Meu carrinho');
    await ana.post('/api/carrinhos', { nome: 'Ativo agora' });

    const r = await ana.delete(`/api/carrinhos/${antigo.id}`);
    assert.equal(r.status, 200);
    assert.deepEqual(nomes(r.corpo.dados), ['Ativo agora']);
    assert.equal(r.corpo.dados.nome, 'Ativo agora');
  });

  test('excluir o ativo promove o carrinho usado mais recentemente', async () => {
    const ana = await amb.novaPessoa();
    await ana.post('/api/carrinhos', { nome: 'Primeiro' });
    await ana.post('/api/carrinhos', { nome: 'Segundo' });
    const estado = (await ana.post('/api/carrinhos', { nome: 'Terceiro' })).corpo.dados;

    // Mexe no "Primeiro" por ultimo: ele passa a ser o mais recente dos inativos.
    const primeiro = porNome(estado, 'Primeiro');
    await ana.post(`/api/carrinhos/${primeiro.id}/itens`, { codigo_produto: 'PEC-001' });

    const r = await ana.delete(`/api/carrinhos/${porNome(estado, 'Terceiro').id}`);
    assert.equal(r.status, 200);
    assert.equal(r.corpo.dados.nome, 'Primeiro');
    assert.equal(ativos(r.corpo.dados).length, 1);
    assert.ok(!nomes(r.corpo.dados).includes('Terceiro'));
  });

  test('excluir o unico carrinho cria um "Meu carrinho" vazio (nunca fica sem)', async () => {
    const ana = await amb.novaPessoa();
    const unico = (await ana.get('/api/carrinhos')).corpo.dados.carrinhos[0];
    await ana.post(`/api/carrinhos/${unico.id}/itens`, { codigo_produto: 'PEC-001' });

    const r = await ana.delete(`/api/carrinhos/${unico.id}`);
    assert.equal(r.status, 200);
    assert.deepEqual(nomes(r.corpo.dados), ['Meu carrinho']);
    assert.equal(r.corpo.dados.itens.length, 0);
    assert.notEqual(r.corpo.dados.id, unico.id, 'e um carrinho novo');
  });

  test('excluir apaga os itens dele (cascata)', async () => {
    const ana = await amb.novaPessoa();
    const estado = (await ana.post('/api/carrinhos', { nome: 'Temporario' })).corpo.dados;
    await ana.post(`/api/carrinhos/${estado.id}/itens`, { codigo_produto: 'PEC-002' });
    await ana.delete(`/api/carrinhos/${estado.id}`);

    const { total } = amb.banco
      .prepare('SELECT COUNT(*) AS total FROM carrinho_itens WHERE carrinho_id = ?')
      .get(estado.id);
    assert.equal(total, 0);
  });
});

describe('isolamento entre carrinhos', () => {
  test('item de um carrinho nao aparece em outro', async () => {
    const ana = await amb.novaPessoa();
    const a = (await ana.post('/api/carrinhos', { nome: 'A' })).corpo.dados;
    await ana.post(`/api/carrinhos/${a.id}/itens`, { codigo_produto: 'PEC-001', quantidade: 3 });
    const b = (await ana.post('/api/carrinhos', { nome: 'B' })).corpo.dados;
    await ana.post(`/api/carrinhos/${b.id}/itens`, { codigo_produto: 'PEC-002', quantidade: 1 });

    const lerA = (await ana.get(`/api/carrinhos/${a.id}`)).corpo.dados;
    const lerB = (await ana.get(`/api/carrinhos/${b.id}`)).corpo.dados;

    assert.deepEqual(lerA.itens.map((i) => [i.codigo_produto, i.quantidade]), [['PEC-001', 3]]);
    assert.deepEqual(lerB.itens.map((i) => [i.codigo_produto, i.quantidade]), [['PEC-002', 1]]);
  });

  test('editar um carrinho que nao e o ativo nao mexe nos outros', async () => {
    const ana = await amb.novaPessoa();
    const a = (await ana.post('/api/carrinhos', { nome: 'A' })).corpo.dados;
    await ana.post(`/api/carrinhos/${a.id}/itens`, { codigo_produto: 'PEC-001', quantidade: 2 });
    await ana.post('/api/carrinhos', { nome: 'B' }); // B vira o ativo

    const r = await ana.patch(`/api/carrinhos/${a.id}/itens/PEC-001`, { quantidade: 7 });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.dados.nome, 'B', 'o ativo continua sendo o B');
    assert.equal((await ana.get(`/api/carrinhos/${a.id}`)).corpo.dados.itens[0].quantidade, 7);
  });

  test('resumo traz pecas e linhas de cada carrinho', async () => {
    const ana = await amb.novaPessoa();
    const a = (await ana.post('/api/carrinhos', { nome: 'A' })).corpo.dados;
    await ana.post(`/api/carrinhos/${a.id}/itens`, { codigo_produto: 'PEC-001', quantidade: 3 });
    const estado = (await ana.post(`/api/carrinhos/${a.id}/itens`, { codigo_produto: 'PEC-002', quantidade: 2 })).corpo.dados;

    const resumo = porNome(estado, 'A');
    assert.equal(resumo.quantidade_itens, 2);
    assert.equal(resumo.quantidade_pecas, 5);
  });

  test('outra pessoa recebe 404 em TODAS as rotas do carrinho alheio', async () => {
    const ana = await amb.novaPessoa();
    const bia = await amb.novaPessoa();
    const anaCarrinho = (await ana.post('/api/carrinhos', { nome: 'Da Ana' })).corpo.dados;
    await ana.post(`/api/carrinhos/${anaCarrinho.id}/itens`, { codigo_produto: 'PEC-001' });
    const id = anaCarrinho.id;

    const tentativas = [
      bia.get(`/api/carrinhos/${id}`),
      bia.patch(`/api/carrinhos/${id}`, { nome: 'Roubado' }),
      bia.post(`/api/carrinhos/${id}/ativar`),
      bia.delete(`/api/carrinhos/${id}`),
      bia.post(`/api/carrinhos/${id}/itens`, { codigo_produto: 'PEC-002' }),
      bia.patch(`/api/carrinhos/${id}/itens/PEC-001`, { quantidade: 9 }),
      bia.delete(`/api/carrinhos/${id}/itens/PEC-001`),
      bia.delete(`/api/carrinhos/${id}/itens`),
    ];

    for (const r of await Promise.all(tentativas)) {
      assert.equal(r.status, 404);
      assert.equal(r.corpo.erro.codigo, 'NAO_ENCONTRADO');
    }

    // E nada mudou no carrinho da Ana.
    const intacto = (await ana.get(`/api/carrinhos/${id}`)).corpo.dados;
    assert.equal(intacto.nome, 'Da Ana');
    assert.deepEqual(intacto.itens.map((i) => [i.codigo_produto, i.quantidade]), [['PEC-001', 1]]);
  });

  test('id que nao e numero ou nao existe tambem da 404', async () => {
    const ana = await amb.novaPessoa();
    for (const id of ['abc', '0', '-1', '1.5', '99999999']) {
      assert.equal((await ana.get(`/api/carrinhos/${id}`)).status, 404, `id=${id}`);
    }
  });
});

describe('itens', () => {
  test('adicionar soma a quantidade; alterar; remover; esvaziar mantem o carrinho', async () => {
    const ana = await amb.novaPessoa();
    const id = (await ana.get('/api/carrinhos')).corpo.dados.id;

    await ana.post(`/api/carrinhos/${id}/itens`, { codigo_produto: 'PEC-001', quantidade: 2 });
    let r = await ana.post(`/api/carrinhos/${id}/itens`, { codigo_produto: 'PEC-001', quantidade: 3 });
    assert.equal(r.corpo.dados.itens[0].quantidade, 5);

    r = await ana.patch(`/api/carrinhos/${id}/itens/PEC-001`, { quantidade: 4 });
    assert.equal(r.corpo.dados.itens[0].quantidade, 4);

    await ana.post(`/api/carrinhos/${id}/itens`, { codigo_produto: 'PEC-002' });
    r = await ana.delete(`/api/carrinhos/${id}/itens/PEC-001`);
    assert.deepEqual(r.corpo.dados.itens.map((i) => i.codigo_produto), ['PEC-002']);

    r = await ana.delete(`/api/carrinhos/${id}/itens`);
    assert.equal(r.status, 200);
    assert.equal(r.corpo.dados.itens.length, 0);
    assert.equal(r.corpo.dados.carrinhos.length, 1, 'o carrinho continua existindo');
  });

  test('nao adiciona acima do estoque, produto inexistente ou fora de linha', async () => {
    const ana = await amb.novaPessoa();

    let r = await ana.post('/api/carrinho/itens', { codigo_produto: 'PEC-003', quantidade: 4 });
    assert.equal(r.status, 409);
    assert.equal(r.corpo.erro.codigo, 'ESTOQUE_INSUFICIENTE');

    r = await ana.post('/api/carrinho/itens', { codigo_produto: 'NAO-EXISTE' });
    assert.equal(r.status, 404);

    r = await ana.post('/api/carrinho/itens', { codigo_produto: 'FORA-LN' });
    assert.equal(r.status, 409);
    assert.equal(r.corpo.erro.codigo, 'PRODUTO_INATIVO');
  });

  test('atalho /api/carrinho age sobre o carrinho ATIVO', async () => {
    const ana = await amb.novaPessoa();
    await ana.post('/api/carrinhos', { nome: 'Ativo' });
    const r = await ana.post('/api/carrinho/itens', { codigo_produto: 'PEC-001', quantidade: 2 });

    assert.equal(r.status, 201);
    assert.equal(r.corpo.dados.nome, 'Ativo');
    assert.equal(r.corpo.dados.itens[0].quantidade, 2);
    assert.equal(porNome(r.corpo.dados, 'Meu carrinho').quantidade_pecas, 0);
  });
});

describe('contrato antigo (/api/carrinho)', () => {
  test('DELETE /api/carrinho esvazia o ativo, como antes', async () => {
    const ana = await amb.novaPessoa();
    await ana.post('/api/carrinho/itens', { codigo_produto: 'PEC-001' });
    const r = await ana.delete('/api/carrinho');

    assert.equal(r.status, 200);
    assert.equal(r.corpo.dados.itens.length, 0);
    assert.equal(r.corpo.dados.carrinhos.length, 1);
  });
});

describe('checkout: fecha so o carrinho escolhido', () => {
  async function prepararDoisCarrinhos() {
    const ana = await amb.novaPessoa('Ana Souza');
    const endereco = await amb.novoEndereco(ana);
    await ana.post('/api/carrinho/itens', { codigo_produto: 'PEC-001', quantidade: 2 }); // Meu carrinho
    const gol = (await ana.post('/api/carrinhos', { nome: 'Gol' })).corpo.dados;
    await ana.post(`/api/carrinhos/${gol.id}/itens`, { codigo_produto: 'PEC-002', quantidade: 1 });
    return { ana, endereco, gol };
  }

  test('o ativo vira pedido e some; os outros ficam exatamente como estavam', async () => {
    const { ana, endereco, gol } = await prepararDoisCarrinhos();

    const r = await ana.post('/api/pedidos', { endereco_id: endereco.id });
    assert.equal(r.status, 201);

    // No ERP foi so o "Gol", e o nome do carrinho foi junto na observacao.
    assert.equal(amb.erp.estado.pedidosCriados.length, 1);
    assert.deepEqual(amb.erp.estado.pedidosCriados[0].itens, [{ codigo_produto: 'PEC-002', quantidade: 1 }]);
    assert.match(amb.erp.estado.pedidosCriados[0].observacao, /Carrinho: Gol/);

    const estado = (await ana.get('/api/carrinhos')).corpo.dados;
    assert.ok(!nomes(estado).includes('Gol'), 'o carrinho fechado sai da lista');
    assert.equal(estado.nome, 'Meu carrinho', 'o outro passa a ser o ativo');
    assert.deepEqual(estado.itens.map((i) => [i.codigo_produto, i.quantidade]), [['PEC-001', 2]]);

    // E aparece em "meus pedidos".
    const pedidos = (await ana.get('/api/pedidos')).corpo.dados;
    assert.equal(pedidos[0].numero, r.corpo.dados.numero);
    assert.ok(gol.id);
  });

  test('fechar o ultimo carrinho deixa um "Meu carrinho" vazio', async () => {
    const ana = await amb.novaPessoa();
    const endereco = await amb.novoEndereco(ana);
    await ana.post('/api/carrinho/itens', { codigo_produto: 'PEC-001' });

    assert.equal((await ana.post('/api/pedidos', { endereco_id: endereco.id })).status, 201);

    const estado = (await ana.get('/api/carrinhos')).corpo.dados;
    assert.deepEqual(nomes(estado), ['Meu carrinho']);
    assert.equal(estado.itens.length, 0);
  });

  test('carrinho_id escolhe qual fechar, sem trocar o ativo', async () => {
    const { ana, endereco, gol } = await prepararDoisCarrinhos();
    const padrao = porNome((await ana.get('/api/carrinhos')).corpo.dados, 'Meu carrinho');

    // O ativo e o Gol, mas a pessoa manda fechar o "Meu carrinho".
    const r = await ana.post('/api/pedidos', { endereco_id: endereco.id, carrinho_id: padrao.id });
    assert.equal(r.status, 201);
    assert.deepEqual(amb.erp.estado.pedidosCriados[0].itens, [{ codigo_produto: 'PEC-001', quantidade: 2 }]);

    const estado = (await ana.get('/api/carrinhos')).corpo.dados;
    assert.deepEqual(nomes(estado), ['Gol']);
    assert.equal(estado.id, gol.id);
  });

  test('nao fecha carrinho de outra pessoa (404) e nao cria nada no ERP', async () => {
    const { ana, gol } = await prepararDoisCarrinhos();
    const bia = await amb.novaPessoa();
    const enderecoBia = await amb.novoEndereco(bia);

    const r = await bia.post('/api/pedidos', { endereco_id: enderecoBia.id, carrinho_id: gol.id });
    assert.equal(r.status, 404);
    assert.equal(amb.erp.estado.pedidosCriados.length, 0);
    assert.ok(porNome((await ana.get('/api/carrinhos')).corpo.dados, 'Gol'), 'o carrinho da Ana segue la');
  });

  test('carrinho vazio e carrinho com pendencia sao recusados e destravam em seguida', async () => {
    const ana = await amb.novaPessoa();
    const endereco = await amb.novoEndereco(ana);

    let r = await ana.post('/api/pedidos', { endereco_id: endereco.id });
    assert.equal(r.status, 409);
    assert.equal(r.corpo.erro.codigo, 'CARRINHO_VAZIO');

    await ana.post('/api/carrinho/itens', { codigo_produto: 'PEC-003', quantidade: 2 });
    amb.erp.estado.produtos.get('PEC-003').estoque = 0; // acabou depois de entrar no carrinho

    r = await ana.post('/api/pedidos', { endereco_id: endereco.id });
    assert.equal(r.status, 409);
    assert.equal(r.corpo.erro.codigo, 'CARRINHO_COM_PENDENCIAS');
    assert.equal(amb.erp.estado.pedidosCriados.length, 0);

    // A reserva foi liberada: da para editar o carrinho de novo.
    r = await ana.delete('/api/carrinho/itens/PEC-003');
    assert.equal(r.status, 200);
  });

  test('ERP fora do ar: erro 502, carrinho intacto e editavel', async () => {
    const ana = await amb.novaPessoa();
    const endereco = await amb.novoEndereco(ana);
    await ana.post('/api/carrinho/itens', { codigo_produto: 'PEC-001', quantidade: 2 });
    amb.erp.estado.falharPedido = true;

    const r = await ana.post('/api/pedidos', { endereco_id: endereco.id });
    assert.equal(r.status, 502);

    const estado = (await ana.get('/api/carrinhos')).corpo.dados;
    assert.equal(estado.itens[0].quantidade, 2);
    assert.equal((await ana.patch('/api/carrinho/itens/PEC-001', { quantidade: 3 })).status, 200);
  });

  test('dois "Confirmar" ao mesmo tempo geram UM pedido (o outro leva 409)', async () => {
    const ana = await amb.novaPessoa();
    const endereco = await amb.novoEndereco(ana);
    await ana.post('/api/carrinho/itens', { codigo_produto: 'PEC-001', quantidade: 2 });
    amb.erp.estado.atrasoPedidoMs = 300; // deixa as duas chamadas se sobreporem

    const [um, dois] = await Promise.all([
      ana.post('/api/pedidos', { endereco_id: endereco.id }),
      ana.post('/api/pedidos', { endereco_id: endereco.id }),
    ]);

    assert.deepEqual([um.status, dois.status].sort(), [201, 409]);
    assert.equal(amb.erp.estado.pedidosCriados.length, 1);
    assert.equal(amb.erp.estado.produtos.get('PEC-001').estoque, 18, 'o estoque baixou uma vez so');
  });

  test('enquanto o pedido sai, o carrinho nao aceita edicao nem exclusao', async () => {
    const ana = await amb.novaPessoa();
    const endereco = await amb.novoEndereco(ana);
    const id = (await ana.post('/api/carrinho/itens', { codigo_produto: 'PEC-001' })).corpo.dados.id;
    amb.erp.estado.atrasoPedidoMs = 400;

    const pedido = ana.post('/api/pedidos', { endereco_id: endereco.id });
    await new Promise((ok) => setTimeout(ok, 100));

    const edicao = await ana.post(`/api/carrinhos/${id}/itens`, { codigo_produto: 'PEC-002' });
    const exclusao = await ana.delete(`/api/carrinhos/${id}`);
    assert.equal(edicao.status, 409);
    assert.equal(edicao.corpo.erro.codigo, 'CARRINHO_FECHANDO');
    assert.equal(exclusao.status, 409);

    assert.equal((await pedido).status, 201);
    assert.equal(amb.erp.estado.pedidosCriados[0].itens.length, 1, 'o item novo nao entrou no pedido');
  });

  test('o endereco escolhido e o que vai para o pedido (nao o principal)', async () => {
    const ana = await amb.novaPessoa();
    await amb.novoEndereco(ana, { apelido: 'Casa', logradouro: 'Rua Principal', principal: true });
    const trabalho = await amb.novoEndereco(ana, { apelido: 'Trabalho', logradouro: 'Avenida do Trabalho' });
    await ana.post('/api/carrinho/itens', { codigo_produto: 'PEC-001' });

    const r = await ana.post('/api/pedidos', { endereco_id: trabalho.id });
    assert.equal(r.status, 201);
    assert.match(amb.erp.estado.pedidosCriados[0].observacao, /Avenida do Trabalho/);
    assert.doesNotMatch(amb.erp.estado.pedidosCriados[0].observacao, /Rua Principal/);
    assert.equal(r.corpo.dados.endereco_entrega.logradouro, 'Avenida do Trabalho');
  });
});
