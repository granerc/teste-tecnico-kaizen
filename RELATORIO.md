# Relatório de entrega

**Candidato:** Camila Graner
**Data de entrega:** 12/10/2026
**Tempo aproximado dedicado:** _[preencher]_

Resumo em cinco linhas:

- Os 4 chamados estão corrigidos na causa, cada um em seu branch, e cada correção tem teste que **falha se o bug voltar** (conferi quebrando o código de propósito).
- Achei e corrigi mais 9 problemas por conta própria (seção 3). O mais sério: **token do ERP e segredo do JWT estavam fixos no código**.
- Múltiplos carrinhos prontos: banco, API, painel ao lado da vitrine (desktop) e gaveta no celular.
- Testes automatizados: backend 49, frontend 52. Rodam com `npm test` em cada pasta.
- **Não criei nenhum pedido no ERP real.** O checkout foi testado contra um ERP falso.

---

## 1. Subindo o projeto

**Como subi:** `npm install` em `backend/` e em `frontend/`; copiei `backend/.env.example` para `backend/.env` e preenchi; `npm start` no backend (porta 3001) e `npm run dev` no frontend (porta 5173, o Vite faz proxy de `/api`). O banco é criado sozinho na subida.

**O que foi confuso:**

1. O enunciado me deu `SIAC_URL` e `SIAC_TOKEN`, mas o projeto lê `ERP_URL` e `ERP_TOKEN`. Só descobri lendo o `config.js`. Mesma coisa, nomes diferentes.
2. O projeto **subia sem nenhuma configuração**, porque o código tinha valores padrão com o token e o segredo. Isso parece conveniente e é o problema nº 1 da seção 3.

**Arquivos que criei e não estavam no repositório:** `backend/.env` (local, ignorado pelo git, com o token) e o `.gitignore` da raiz (o repositório não tinha, e versionava o banco e o build).

---

## 2. Chamados reportados

### KZN-312 — Total do carrinho vem maior que a soma das peças

| | |
|---|---|
| **Causa** | `lerCarrinho` somava o `valor_total` de **todas** as linhas, inclusive as que não dá para comprar (sem estoque, estoque menor que a quantidade, fora de linha). O total incluía peça que o checkout depois bloqueia. |
| **Como reproduzi** | Montei um carrinho e simulei o estoque zerando depois de a peça entrar (a API não deixa adicionar sem estoque, então inseri a linha direto no banco). Total da API menos soma das linhas disponíveis = **R$ 684,00**, o mesmo valor do chamado. Peça: Radiador de Água sem Ar. |
| **Arquivos alterados** | `backend/src/services/carrinhoService.js` (total só soma `disponivel`), `frontend/src/paginas/Carrinho.jsx` |
| **Como validei a correção** | Diferença foi para R$ 0,00. Testes: backend `regressoes.test.js` (sem estoque e estoque parcial), frontend `paginas.test.jsx` e `painel.test.jsx`. Quebrei o código de propósito e o teste falhou. |

**Observação / decisão:** a linha indisponível **continua visível**, riscada, com o motivo e a etiqueta "fora do total". Esconder a linha seria pior: a pessoa não entenderia por que o botão de fechar está travado. Cuidado de CSS: `line-through` no elemento pai risca os filhos também, então separei o valor da etiqueta em dois `span`.

### KZN-318 — Número no ícone do carrinho está errado

| | |
|---|---|
| **Causa** | `quantidade_pecas` era preenchido com `itens.length` (número de **linhas**), e não com a soma das quantidades. |
| **Como reproduzi** | 3× ELE-5007 + 4× MOT-3003 → a API devolvia `quantidade_pecas: 2`; o correto é 7 (o mesmo "2 em vez de 7" do chamado). |
| **Arquivos alterados** | `backend/src/services/carrinhoService.js` |
| **Como validei a correção** | Passou a devolver 7. Testes no backend (2+5 = 7 em 2 linhas) e no frontend (selo do cabeçalho mostra 7). Reintroduzi o bug e o teste falhou. |

Corrigi no backend, onde o dado nasce, e não só no selo do front: o resumo do carrinho também usa esse campo.

### KZN-325 — Busca diz que não encontrou peça que existe

| | |
|---|---|
| **Causa** | `?pagina=N` ficava na URL ao trocar busca, categoria ou filtro. "Amortecedor" tem uma página só, mas a URL ainda pedia a 5, e a API respondia lista vazia. Na tela isso vira "Nenhuma peça encontrada". Acontecia no campo de busca do cabeçalho **e** nos filtros da vitrine. |
| **Como reproduzi** | Por leitura do código e depois por teste: ir para a página 2, pesquisar → a URL mantinha `pagina=2`. (Não reproduzi no navegador contra o ERP; a causa é visível na URL.) |
| **Arquivos alterados** | `frontend/src/componentes/Cabecalho.jsx`, `frontend/src/paginas/Catalogo.jsx` |
| **Como validei a correção** | Qualquer mudança de busca/filtro descarta `pagina`; só trocar de página a mantém. Testes de URL no frontend (`vitrine.test.jsx`); quebrei o `delete('pagina')` e falharam. |

**Extra que fiz junto:** link antigo com página além do fim (`?pagina=9` quando só há 3) agora cai na última página que existe, em vez de mostrar "nenhuma peça" quando há resultados. O campo de busca também passou a acompanhar a URL (limpar a busca esvazia a caixa).

### KZN-331 — Pedido saiu com o endereço errado

| | |
|---|---|
| **Causa** | `Checkout.jsx` ignorava o endereço escolhido na tela e mandava o **principal** (`enderecos.find(e => e.principal)`). O estado `enderecoId` existia, mas não era usado no envio. |
| **Como reproduzi** | Por leitura do código e por teste: com "Casa" principal e "Oficina" marcada, o envio ia com o id da Casa. |
| **Arquivos alterados** | `frontend/src/paginas/Checkout.jsx` |
| **Como validei a correção** | Passa a enviar `endereco_id: enderecoId`. Adicionei na tela "Entrega em Oficina — Rua…" para a pessoa conferir antes de confirmar. Testes: frontend (id 2 enviado, não o 1) e backend (a observação enviada ao ERP leva o logradouro escolhido). Reintroduzi o bug e o teste falhou. |

O backend já fazia a coisa certa (usa o `endereco_id` que recebe), então o conserto é só no front. O endereço vai como snapshot no pedido.

---

## 3. Problemas que encontrei por conta própria

### Problema 1 — Token do ERP e segredo do JWT fixos no código (o mais sério)

| | |
|---|---|
| **O que está errado** | `config.js` tinha `PADRAO = { jwtSegredo, erpUrl, erpToken }` com os valores reais, usados quando não havia `.env`. Os dois foram versionados. |
| **Como cheguei nele** | Li o `config.js` antes de subir. Confirmei que o token do `.env` que me passaram é **idêntico** ao que estava fixo no código. |
| **Impacto** | Quem clona o repositório assina sessões com o mesmo segredo de todo mundo (dá para forjar login). O token do ERP está no histórico do git da empresa: **precisa ser rotacionado**, porque remover do código não tira do histórico. |
| **Corrigi?** | Sim. Sem valor padrão no código; `validarConfig()` derruba a subida com mensagem clara se faltar, se o segredo tiver menos de 32 caracteres ou se for o valor de exemplo. Segredos só em `.env` (ignorado pelo git). Também limpei **o histórico deste repositório**: o commit-base tinha os dois valores, então troquei por placeholders em todos os commits (e disse isso na mensagem do commit-base). |
| **Arquivos alterados** | `backend/src/config.js`, `backend/.env.example`, `.gitignore` |

**Não posso rotacionar o token por eles.** Isso é para a Kaizen fazer.

### Problema 2 — CORS refletia qualquer origem, com cookies

| | |
|---|---|
| **O que está errado** | `cors({ origin: true, credentials: true })` devolve `Access-Control-Allow-Origin: <qualquer origem>` com `Allow-Credentials: true`. |
| **Como cheguei nele** | Li o `app.js`; confirmei com `curl` e `Origin: https://site-malicioso.example`: a origem voltava refletida. |
| **Impacto** | Em tese um site de terceiro poderia ler respostas autenticadas. **Na prática o risco hoje é menor**, porque o cookie é `SameSite=Lax` e o navegador não o envia em `fetch` de outro site. Mas a proteção ficou dependendo de um único atributo; trocar para `None` abriria o buraco. |
| **Corrigi?** | Sim: lista de origens permitidas em `CORS_ORIGEM` (separadas por vírgula). No uso normal front e API são a mesma origem (proxy do Vite / backend servindo o build), então o CORS nem entra em jogo. |
| **Arquivos alterados** | `backend/src/app.js`, `backend/src/config.js` |

### Problema 3 — Proxy de imagens servia SVG sem proteção

| | |
|---|---|
| **O que está errado** | `/api/imagens/:arquivo` repassa o SVG do ERP na origem da loja, sem `nosniff` nem CSP. |
| **Como cheguei nele** | Li `routes/imagens.js`. SVG pode carregar script. |
| **Impacto** | Dentro de `<img>` o script nunca roda, mas se alguém abrir a URL da imagem direto, e o ERP servir um SVG malicioso, o script roda na origem da loja (onde vive a sessão). **Baixo**, mas barato de fechar. |
| **Corrigi?** | Sim: `X-Content-Type-Options: nosniff` e `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`. |
| **Arquivos alterados** | `backend/src/routes/imagens.js` |

### Problema 4 — `paraCentavos` truncava em vez de arredondar

| | |
|---|---|
| **O que está errado** | `Math.floor(reais * 100)`. Em ponto flutuante, `312.4 * 100` vale `31239.999999999996`, e o `floor` joga 1 centavo fora **a cada unidade**. |
| **Como cheguei nele** | Comparei o total da API com a conta feita à mão: 3 × 312,40 + 4 × 134,70 devia dar R$ 1.476,00 e a API dava **R$ 1.475,93**. |
| **Impacto** | Total do carrinho e do pedido gravado na loja menores que o valor real, e a diferença cresce com a quantidade. Pedido gravado com valor diferente do que o ERP calcula. |
| **Corrigi?** | Sim: `Math.round`. |
| **Arquivos alterados** | `backend/src/lib/dinheiro.js` |

### Problema 5 — Editar endereço sem enviar "principal" rebaixava o principal

| | |
|---|---|
| **O que está errado** | A rota fazia `lerBooleano(corpo.principal) ?? false`. O serviço já tratava `undefined` como "não mexa", mas ele nunca chegava. |
| **Como cheguei nele** | Reproduzi: editar só o número da "Casa" (principal) e listar: `principal=false`. |
| **Impacto** | O checkout ficava sem endereço padrão e a pessoa só percebia depois. |
| **Corrigi?** | Sim (rota manda `undefined` quando o campo falta). Ver a decisão na seção 6. |
| **Arquivos alterados** | `backend/src/routes/enderecos.js`, `backend/src/services/enderecoService.js` |

### Problema 6 — Não dava para apagar o telefone

| | |
|---|---|
| **O que está errado** | `telefone || atual.telefone`: texto vazio (apagar) era tratado como "não enviado". |
| **Como cheguei nele** | Reproduzi: enviar `telefone: ""` e a API devolvia o número antigo. |
| **Impacto** | Dado pessoal que a pessoa pediu para remover continuava armazenado. |
| **Corrigi?** | Sim: `undefined` mantém; vazio apaga. |
| **Arquivos alterados** | `backend/src/routes/perfil.js`, `backend/src/services/usuarioService.js` |

### Problema 7 — Botão "Próxima" nunca chegava à última página

| | |
|---|---|
| **O que está errado** | `disabled={pagina >= totalPaginas - 1}`: o botão travava na penúltima página. |
| **Como cheguei nele** | Lendo `Paginacao` enquanto corrigia o KZN-325. |
| **Impacto** | As últimas peças de cada listagem só apareciam por URL manual. |
| **Corrigi?** | Sim: `pagina >= totalPaginas`. |
| **Arquivos alterados** | `frontend/src/componentes/ui.jsx` |

### Problema 8 — Carrinho em memória não acompanhava a sessão

| | |
|---|---|
| **O que está errado** | O contexto buscava o carrinho uma vez, na abertura da página. Sair e entrar com **outra conta na mesma aba** mostrava o carrinho da conta anterior; quem acabava de logar via o carrinho vazio até dar F5. |
| **Como cheguei nele** | Lendo `CarrinhoContext` + `AuthContext`. |
| **Impacto** | É só o front (o servidor sempre devolve o carrinho da sessão), mas mostra dado de outra conta na tela, que é o tipo de coisa que gera chamado. Em computador compartilhado de oficina, é plausível. |
| **Corrigi?** | Sim: o carrinho depende do `usuario.id`; ao sair, descarta tudo; resposta que chega depois do logout não repopula (teste cobre). |
| **Arquivos alterados** | `frontend/src/contextos/CarrinhoContext.jsx` |

### Problema 9 — Dois cliques em "Confirmar pedido" criavam dois pedidos

| | |
|---|---|
| **O que está errado** | `finalizarPedido` lia o carrinho, chamava o ERP e só depois limpava. Duas chamadas ao mesmo tempo liam o mesmo carrinho e criavam **dois pedidos**, baixando o estoque duas vezes. |
| **Como cheguei nele** | Lendo o fluxo do checkout (a devolutiva vai perguntar de pedidos disputando a mesma peça). Cobri com teste: com ERP lento, dois `POST /pedidos` simultâneos → um 201 e um 409; estoque baixou **uma** vez. |
| **Impacto** | Pedido duplicado e estoque errado no ERP. Duplo clique, duas abas ou conexão lenta bastam. |
| **Corrigi?** | Sim (junto dos carrinhos): reserva atômica do carrinho com um `UPDATE … WHERE fechando_desde IS NULL OR vencida`. Quem perde recebe 409. A reserva **vence em 1 minuto**, para um processo que cai no meio não travar o carrinho para sempre. |
| **Arquivos alterados** | `backend/src/services/pedidoService.js`, `backend/src/services/carrinhoService.js`, `backend/src/db/schema.sql` |

### Problemas menores que também corrigi

| O que | Onde |
|---|---|
| Banco SQLite e `frontend/dist` estavam versionados no git (o `.gitignore` não existia) | `.gitignore` |
| Layout quebrava no celular: vitrine em `grid-cols-4` fixo (cards de ~80px) e busca do cabeçalho com `min-w-[380px]` | `Catalogo.jsx`, `Cabecalho.jsx` |

### O que vi e **decidi não corrigir** (e por quê)

| O que | Por que não mexi |
|---|---|
| **Checkout não é transacional entre loja e ERP.** Se o ERP cria o pedido e a gravação local falha, o pedido existe e não aparece em "meus pedidos". Pior: se o ERP demorar além do timeout, a loja entende como falha, mas o pedido pode ter sido criado. | Já está registrado no código e no ARQUITETURA. Resolver de verdade pede *outbox* ou endpoint de cancelamento/idempotência no ERP, que não é nosso. Mitiguei só o que dá do lado da loja: a reserva do carrinho **não é liberada** se o pedido já foi criado no ERP, para a pessoa não reenviar e duplicar. |
| **Login sem limite de tentativas.** Não há rate limit nem bloqueio. | Exige decisão de produto (quantas tentativas, bloqueio por IP ou por conta, risco de bloquear cliente legítimo) e provavelmente infraestrutura. Registro como o próximo passo de segurança. |
| **Logout só apaga o cookie.** O JWT continua válido até expirar (7 dias). | Para revogar de verdade é preciso lista de tokens revogados ou sessão no banco. Mudança de arquitetura, fora do escopo. |
| **Ler o carrinho faz uma chamada ao ERP por item**, e a lista de pedidos uma por pedido. | Com no máximo 50 itens e 10 por página compensa a simplicidade. Já está no ARQUITETURA; cache ou consulta em lote no ERP seria a evolução. |
| **CPF/CNPJ só valida o tamanho.** | Já documentado como limitação. |
| **Token do ERP vazado no histórico da empresa.** | Não depende de mim: a Kaizen precisa rotacionar. |

---

## 4. Múltiplos carrinhos

### Como ficou

A pessoa mantém até 10 carrinhos nomeados ("Gol do João", "Civic prata"), troca entre eles, renomeia e exclui. Um é o **ativo**: é o que aparece na vitrine e o que o checkout fecha.

- **Desktop:** painel ao lado da vitrine, fixo na rolagem e recolhível (a escolha fica lembrada no aparelho). Dá para trocar de carrinho, mudar quantidade e remover **sem sair da página**. Busca, categoria e página moram na URL e **não mudam**; o catálogo nem é recarregado (tem teste para isso).
- **Celular:** botão flutuante "Carrinho · N peças" que abre uma gaveta por baixo, com o mesmo painel. A vitrine continua montada por trás, com a rolagem e os filtros intactos.
- **Página `/carrinho`** e **checkout** mostram qual carrinho estão tratando.
- "Adicionar" avisa **em qual carrinho** a peça caiu (`… foi para o carrinho "Gol do João"`), porque com vários carrinhos "foi para o carrinho" não basta.

### Modelagem

```
carrinhos        id, usuario_id → usuarios (ON DELETE CASCADE),
                 nome (NOCASE), ativo (0/1), fechando_desde, criado_em, atualizado_em
                 UNIQUE (usuario_id, nome)
                 UNIQUE INDEX parcial (usuario_id) WHERE ativo = 1
carrinho_itens   id, carrinho_id → carrinhos (ON DELETE CASCADE),
                 codigo_produto, quantidade (> 0), adicionado_em
                 UNIQUE (carrinho_id, codigo_produto)
```

Pontos que valem explicar:

1. **Os itens pertencem ao carrinho, não ao usuário.** Antes `carrinho_itens` apontava para `usuario_id`.
2. **"Um só ativo por pessoa" é garantido pelo banco**, com índice único parcial, e não só pelo código. Trocar de carrinho é desmarcar o antigo e marcar o novo na mesma transação.
3. **Nome único por pessoa, sem diferenciar maiúsculas** (`COLLATE NOCASE`): "Gol" e "gol" são o mesmo nome. Duas pessoas podem ter o mesmo nome.
4. **`fechando_desde` é um instante, não um booleano**, para a reserva do checkout vencer sozinha.
5. **Migração dos dados existentes** (`db/migracoes.js`), idempotente e dentro de uma transação: cada pessoa com itens ganha um "Meu carrinho" ativo com os itens que já tinha. Testei com o banco antigo e com um banco legado em memória.

**Contrato da API.** Toda resposta devolve o **mesmo formato**: conteúdo do carrinho ativo + `carrinhos` (resumo de todos) + `limite_carrinhos`. O front só troca o estado inteiro a cada resposta, sem remendar.

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/carrinhos` | Estado: conteúdo do ativo + resumo de todos |
| POST | `/api/carrinhos` | Cria (já fica ativo). 409 se nome repetido ou limite atingido |
| GET | `/api/carrinhos/:id` | Conteúdo de um carrinho (leitura) |
| PATCH | `/api/carrinhos/:id` | Renomeia |
| POST | `/api/carrinhos/:id/ativar` | Troca o ativo (idempotente) |
| DELETE | `/api/carrinhos/:id` | Exclui, com os itens |
| POST | `/api/carrinhos/:id/itens` | Adiciona item |
| PATCH | `/api/carrinhos/:id/itens/:codigo` | Muda quantidade |
| DELETE | `/api/carrinhos/:id/itens/:codigo` | Remove item |
| DELETE | `/api/carrinhos/:id/itens` | Esvazia (o carrinho continua) |
| * | `/api/carrinho/...` | **Atalho do contrato antigo**: mesmos caminhos, agindo no ativo |
| POST | `/api/pedidos` | Fecha o **ativo**. `carrinho_id` opcional funciona como trava (ver seção 6) |

Mantive `/api/carrinho` para não quebrar quem já consumia a API; o front novo usa `/api/carrinhos` com **id explícito**.

### Decisões que o enunciado deixou abertas

| Pergunta | Sua decisão | Motivo |
|---|---|---|
| Quantos carrinhos por pessoa? Tem limite? | **Até 10.** Dentro de cada um, 50 produtos diferentes e 99 unidades por produto. | Uma oficina trabalha com poucos orçamentos em paralelo (um carro por bancada); 10 cobre com folga. Sem limite, carrinhos abandonados se acumulam, cada um custa leituras no ERP e uma linha a mais no seletor. O número é uma constante (`MAXIMO_CARRINHOS`), fácil de mudar. No limite, o botão "Novo carrinho" desabilita e explica por quê. |
| O que acontece ao apagar o carrinho ativo? | Pede **confirmação** (diz quantas peças serão perdidas). Depois, o carrinho **usado mais recentemente** passa a ser o ativo. Se era o único, nasce um "Meu carrinho" vazio. | A pessoa nunca fica sem carrinho ativo, então o front nunca precisa tratar "sem carrinho". O mais recente é o que ela provavelmente estava mexendo. Excluir não tem desfazer, por isso a confirmação. |
| Como o carrinho aparece na vitrine? | Painel lateral fixo e **recolhível** ao lado das peças. | O pedido do comercial foi exatamente "parar de sair da tela de peças". Painel ao lado evita a navegação, e como não mexe na URL a busca e a página não se perdem. Recolher devolve a largura para quem quer ver mais peças (a grade passa de 3 para 4 colunas). |
| E no celular? | Botão flutuante com contagem + **gaveta por baixo**, acessível (diálogo, foco preso, Esc fecha, devolve o foco, trava a rolagem do fundo). | Não sobra largura para painel lateral. O botão fica sempre ao alcance do polegar e a gaveta cobre só parte da tela, com a vitrine intacta por trás. |
| Qual carrinho vem selecionado ao entrar? | **O que estava ativo da última vez**, guardado no servidor. Conta nova ou migrada: "Meu carrinho". | A pessoa volta de onde parou, em qualquer aparelho. Guardar no servidor (e não no navegador) é o que faz funcionar entre computador e celular. |
| O que acontece com os carrinhos após fechar um pedido? | O carrinho fechado **some** (o pedido é o registro). O mais recente dos outros vira o ativo; **os outros ficam intactos**. Se era o último, nasce um "Meu carrinho" vazio. | O enunciado diz que o checkout fecha um por vez. Manter o carrinho vazio com o nome do carro acumularia lixo. O nome do carrinho vai na observação do pedido no ERP ("Carrinho: Gol do João"), o que ajuda a separar no balcão. |

### Isolamento

O que impede o carrinho de um cliente aparecer para outro:

1. **Não existe consulta de item sem passar por um carrinho.** Toda operação recebe o id do carrinho e primeiro confere `WHERE id = ? AND usuario_id = ?` (a pessoa vem da sessão, nunca do corpo da requisição).
2. **Carrinho alheio responde 404**, igual a carrinho que não existe, para o id na URL não revelar que existe. Testado em todas as 8 rotas, e com ids inválidos (`abc`, `0`, `-1`, `1.5`).
3. **Dentro do mesmo usuário**: item de um carrinho não aparece em outro (os itens apontam para `carrinho_id`), editar um carrinho inativo não mexe no ativo, e `ON DELETE CASCADE` apaga os itens junto.
4. **No front**, as ações de item usam o id do carrinho **que está na tela**, e não "o ativo do servidor": se o ativo mudou em outra aba, o clique age no carrinho que a pessoa estava vendo, nunca num outro às escondidas. Se esse carrinho já foi apagado (404), a tela se ressincroniza.
5. **Resposta fora de ordem**: só a chamada mais recente escreve no estado. Duas trocas seguidas (a antiga chega depois) não desfazem a escolha nova. Sair da conta descarta tudo.

---

## 5. Como testei

**Automatizado** (nenhum teste toca o ERP real):

```bash
cd backend  && npm test    # 49 testes  (node:test)
cd frontend && npm test    # 52 testes  (vitest + Testing Library)
cd frontend && npm run build
```

- **Backend:** um ERP falso em memória (o estoque baixa de verdade, com atraso e falha configuráveis) e um banco SQLite temporário por arquivo de teste. Cobre: carrinhos (criar, nome repetido, limite, trocar, excluir, isolamento entre pessoas), itens, checkout (só o ativo, vazio, pendência, ERP fora do ar, **dois pedidos simultâneos**, carrinho travado durante o pedido, endereço escolhido), migração do banco antigo e as correções (KZN-312, KZN-318, arredondamento, endereço principal, telefone, CORS, cabeçalhos das imagens).
- **Frontend:** `fetch` trocado por um servidor falso. Cobre painel, seletor, gaveta do celular (foco, Esc), vitrine (URL e busca preservadas ao editar o carrinho), checkout e os chamados KZN-312/318/325/331.
- **Conferi que os testes pegam o bug:** para 9 deles reintroduzi o bug no código e vi o teste **falhar**: no backend KZN-312, KZN-318, o arredondamento e a reserva do checkout (clique duplo); no frontend KZN-318, KZN-325, KZN-331, KZN-312 e a guarda de "resposta mais recente vence". Teste que nunca falha não protege nada.

**Manual:**

- Com o servidor rodando contra o **ERP real** (só leituras, sem criar pedido): cadastro, adicionar peças reais (ELE-5007 × 2 = R$ 624,80, o arredondamento certo), criar segundo carrinho, trocar, excluir o ativo. Também subi com o banco antigo (carrinho único) e conferi a migração.
- Num navegador real (Chromium), em 1280, 390 e 360 px: sem rolagem horizontal, painel só no desktop, 3 colunas com o painel e 4 sem ele, 2 colunas no celular, gaveta abre e Esc fecha. Adicionar uma peça não mudou a URL.

**O que NÃO testei:** o checkout contra o ERP de verdade, porque criaria um pedido real na Kaizen. O fluxo foi testado com o ERP falso (que imita o contrato que o `erp/cliente.js` espera). Também não rodei em Safari/Firefox.

---

## 6. Decisões e suposições

- **`carrinho_id` no checkout é uma trava, não uma escolha.** O enunciado diz que o checkout fecha "o que estiver ativo". Meu primeiro rascunho aceitava fechar qualquer carrinho da pessoa; corrigi. Agora o servidor sempre fecha o ativo. O front manda o id do carrinho que está na tela, e se ele não for o ativo (a pessoa trocou em outra aba) a resposta é **409 `CARRINHO_ATIVO_MUDOU`** e a tela se relê.
- **Marcar `principal: false` num endereço não rebaixa o principal.** O principal só deixa de ser quando **outro** é promovido. Isso vale a mesma garantia de `removerEndereco`: o checkout nunca fica sem endereço padrão. Se o comercial preferir poder ficar sem principal, é uma linha.
- **O "Meu carrinho" padrão nasce sob demanda** (na primeira leitura ou criação), e não no cadastro. Assim contas antigas, novas e migradas passam pelo mesmo caminho. Criar um carrinho garante o padrão antes, para o resultado não depender de a pessoa já ter aberto a lista (um teste pegou essa dependência de ordem).
- **Mantive `/api/carrinho`** como atalho do ativo para não quebrar consumidores do contrato antigo.
- **Seletor com `<select>` nativo**, e não um menu customizado: acessível por padrão e usa o seletor do próprio celular.
- **Excluir carrinho pede confirmação inline**, e não `window.confirm`: o nativo bloqueia, é feio e não dá para testar.
- **Segui os padrões do projeto:** rota → serviço, `ColetorDeErros`, formato `{erro:{codigo,mensagem,detalhes?}}` e `{dados}`, helpers de `ApiError`, injeção de `db` no último parâmetro, regra de contraste da paleta (texto sobre `marca-700` ou mais escuro; `marca-500` só em superfície).

**Discordei de:** o projeto ter valores padrão que fazem tudo "subir sem configurar" (problema 1): conveniência que vira falha de segurança. Eu manteria o fail-fast.

---

## 7. O que faria com mais tempo

1. **Idempotência e *outbox* no checkout.** É o maior risco de negócio que sobrou: pedido criado no ERP sem registro na loja, ou duplicado por timeout. Precisa de chave de idempotência no ERP.
2. **Limite de tentativas no login** (e decidir a política com o produto) e revogação de sessão no logout.
3. **Testes de ponta a ponta em navegador** (Playwright) no CI, para travar o layout do painel e da gaveta. Hoje eu conferi à mão e só os testes de componente estão automatizados.
4. **Expirar carrinhos abandonados** (hoje ficam até a pessoa apagar) e/ou mostrar "última atividade" no seletor.
5. **Reduzir as chamadas ao ERP na leitura do carrinho** (uma por item) com cache curto ou consulta em lote.

---

## 8. Outras observações

- **Rotacionar o token do ERP.** Estava fixo no código original (público no histórico da empresa). Já não está no código, mas continua no histórico de lá.
- **Histórico do git:** os commits estão em branches por assunto (`fix/kzn-312-…`, `feat/multiplos-carrinhos`, …), cada um com merge em `main`. O commit-base tem os dois segredos trocados por placeholders; está dito na mensagem dele.
- **Uso de IA:** usei o Claude Code (IA) para investigar, implementar e escrever os testes. Os commits trazem o trailer `Co-Authored-By`. _[Camila: acrescente aqui, com suas palavras, o que você revisou e entendeu, e confirme que consegue explicar cada decisão.]_
