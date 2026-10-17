# Guia das tabelas do banco Goia

Documento baseado no `schema.prisma` desta pasta, após a integração do módulo financeiro e dos pedidos de clientes. Abrange os **64 modelos de tabela**, em ordem alfabética, conforme a organização do schema.

As finalidades abaixo são descritas a partir dos campos e relacionamentos definidos no schema. Os exemplos ilustram possibilidades de uso; a criação automática de registros, os cálculos e as mudanças de status dependem da implementação da aplicação. Este documento não confirma quais rotinas já estão implementadas nem se o banco em execução já recebeu todas as alterações.

## Como interpretar a estrutura

- **Cadastro:** guarda informações relativamente estáveis, como clientes, produtos e fornecedores.
- **Cabeçalho e itens:** uma tabela representa o documento inteiro, e outra guarda cada produto desse documento. Exemplo: `venda` e `item_venda`.
- **Vínculo:** associa cadastros e guarda informações específicas dessa associação. Exemplo: `usuario_empresa`.
- **Movimentação:** registra acontecimentos ao longo do tempo, como entradas de estoque ou pagamentos.
- **`id_empresa`:** identifica a empresa à qual o registro está associado. Nas tabelas em que é opcional, o schema permite registros sem empresa; o significado desse caso depende da aplicação.
- **Enums:** são listas de valores permitidos, como status e tipos. Os blocos `enum` ao final do schema não representam tabelas independentes neste banco MySQL.

## Catálogo das tabelas

### 01. `administradores_gerais`

**Utilidade:** manter o cadastro de administradores gerais, com nome, e-mail, hash da senha, status e data de cadastro.

**Relações e uso:** não possui relacionamentos explícitos com outras tabelas. Pode sustentar um acesso administrativo geral, separado do cadastro de `usuarios`; o alcance desse acesso é definido pela aplicação.

### 02. `auditoria`

**Utilidade:** registrar eventos para rastrear quem realizou uma ação, quando ela ocorreu e quais dados foram alterados. Guarda tabela, identificador do registro, ação, dados anteriores e novos, IP e data.

**Relações e uso:** pode apontar para `empresas` e `usuarios`. Exemplo: registrar uma alteração no cadastro de um cliente. A referência ao registro auditado é feita por nome da tabela e identificador, sem uma chave estrangeira para cada tabela de origem.

### 03. `cargos`

**Utilidade:** cadastrar funções profissionais de cada empresa, como vendedor, gerente ou operador.

**Relações e uso:** pertence a `empresas` e é utilizado em `usuario_empresa`. Permite indicar o cargo do usuário naquela empresa; as permissões detalhadas ficam em outras tabelas.

### 04. `categoria_financeira`

**Utilidade:** classificar lançamentos financeiros como receita, despesa ou ambos, facilitando a organização e os relatórios por categoria.

**Relações e uso:** pertence a `empresas` e classifica `contas_receber`, `contas_pagar` e `despesas`. Exemplos de categorias: vendas de produtos, compra de matéria-prima e despesas administrativas.

### 05. `categorias`

**Utilidade:** agrupar produtos por características comerciais ou operacionais, como tecidos, aviamentos e peças acabadas.

**Relações e uso:** relaciona-se com `produtos` e pode pertencer a uma empresa. É a classificação do catálogo de produtos; a classificação de valores financeiros fica em `categoria_financeira`.

### 06. `cliente_contato`

**Utilidade:** permitir vários contatos para um mesmo cliente, guardando tipo, valor, descrição e indicação de contato principal e ativo.

**Relações e uso:** cada contato pertence a `clientes`. Exemplo: cadastrar um telefone comercial e um e-mail de cobrança, além dos dados principais existentes no cadastro do cliente. O tipo do contato é texto livre no schema.

### 07. `cliente_endereco`

**Utilidade:** armazenar vários endereços por cliente, classificados como principal, entrega, cobrança ou outro, com referência e indicação de ativo e principal.

**Relações e uso:** pertence a `clientes` e pode ser selecionado como endereço de entrega em `venda`. Exemplo: um cliente com endereço de cobrança na sede e entrega em uma filial.

### 08. `clientes`

**Utilidade:** centralizar o cadastro dos compradores de cada empresa: identificação, CPF/CNPJ, contato, endereço principal, tipo de pessoa, limite de crédito, observações e status.

**Relações e uso:** pertence a `empresas`, pode ter uma `condicoes_pagamento` e possui contatos, endereços e vendas. Exemplo: cadastrar uma pessoa jurídica com uma condição de pagamento usual. A verificação do limite de crédito depende da aplicação.

### 09. `compra_itens`

**Utilidade:** detalhar os produtos de uma compra, com quantidade, valor unitário, valor total e, quando aplicável, cor e tamanho.

**Relações e uso:** liga `compras` a `produtos`, `cores` e `tamanhos`. Exemplo: uma compra com tecido azul e tecido branco em linhas separadas.

### 10. `compras`

**Utilidade:** representar o documento principal de compra, com empresa, fornecedor, local de estoque, responsável, código, origem, status e data de emissão.

**Relações e uso:** reúne `compra_itens`, `nota_fiscal` e `contas_pagar`. Pode estar ligada a uma `ordem_producao` e a um `pedido_compra` legado. Exemplo: registrar uma compra de materiais para atender à produção.

### 11. `condicoes_pagamento`

**Utilidade:** cadastrar regras comerciais de pagamento por empresa, incluindo número de parcelas, intervalo em dias, desconto percentual e permissão de crédito ou parcelamento.

**Relações e uso:** pode ser utilizada em `clientes` e `venda`. Exemplo: uma condição de três parcelas com intervalo de 30 dias. A geração dos vencimentos e das parcelas deve ser feita pela aplicação.

### 12. `consumo_producao`

**Utilidade:** registrar o consumo de material na produção, identificando produto, quantidade, setor, usuário e data de consumo.

**Relações e uso:** conecta `ordem_producao`, `necessidade_producao` e `reserva_estoque` ao produto consumido. Exemplo: apontar o consumo de 20 metros de tecido que estavam reservados para uma ordem.

### 13. `contas_bancarias`

**Utilidade:** cadastrar os locais financeiros onde o dinheiro é controlado, como conta corrente, poupança, caixa e carteira digital. Guarda identificação bancária, tipo, saldo inicial e status.

**Relações e uso:** pertence a `empresas` e recebe lançamentos de `movimentacoes_financeiras`. O schema guarda o saldo inicial; o saldo corrente pode ser calculado somando as entradas e subtraindo as saídas registradas.

### 14. `contas_pagar`

**Utilidade:** registrar obrigações financeiras de compras, inclusive parcelas, vencimentos, valor original, descontos, acréscimos, valor final e situação.

**Relações e uso:** cada conta pertence a uma empresa e exige uma `compras` e uma `categoria_financeira`. Pode receber vários `pagamentos_pagar` e estar associada a `despesas`. Exemplo: uma compra em três parcelas representada por três contas a pagar.

### 15. `contas_receber`

**Utilidade:** registrar valores a receber de vendas, com identificação de parcela, vencimento, valores e situação financeira.

**Relações e uso:** exige vínculos com `empresas`, `venda` e `categoria_financeira`, e pode ter vários `pagamentos_receber`. O cliente é identificado por meio da venda. Exemplo: uma parcela de R$ 500 que será quitada em dois recebimentos.

### 16. `cores`

**Utilidade:** manter o catálogo de cores, com nome, código hexadecimal opcional e status.

**Relações e uso:** pode estar ligada a uma empresa e é utilizada em variações de produtos, configurações por empresa, itens de compra, notas fiscais e ordens de produção. Exemplo: identificar uma peça como azul.

### 17. `despesas`

**Utilidade:** registrar gastos da empresa, com descrição, categoria, data, valor, situação e observações.

**Relações e uso:** pertence a `empresas` e `categoria_financeira`; pode apontar para `contas_pagar` e ter `movimentacoes_financeiras`. Exemplo: registrar um gasto de energia elétrica. A ligação com conta a pagar é opcional, e as contas a pagar do schema atual exigem uma compra.

### 18. `empresa_fornecedor`

**Utilidade:** guardar as condições do relacionamento entre uma empresa e um fornecedor, como prazo de pagamento, prazo de entrega, observação e status.

**Relações e uso:** associa `empresas` a `fornecedores`, com um registro por par empresa/fornecedor. Exemplo: indicar que determinado fornecedor entrega em sete dias para aquela empresa.

### 19. `empresas`

**Utilidade:** centralizar os dados das empresas atendidas pelo sistema, incluindo razão social, CNPJ, contatos, endereço, identidade visual e status.

**Relações e uso:** é a referência organizacional de grande parte do banco: usuários vinculados, clientes, compras, vendas, produção, estoque e financeiro. Exemplo: distinguir as operações de duas empresas no mesmo sistema.

### 20. `estoque`

**Utilidade:** guardar a posição de quantidade e quantidade reservada de um produto, associada à empresa, ao local de estoque e ao setor.

**Relações e uso:** relaciona `empresas`, `locais_estoque`, `setores` e `produtos`. Exemplo: registrar 100 unidades existentes, das quais 20 estão reservadas. O histórico das operações fica em `movimentacao_estoque` e `kardex`. Esta tabela não possui campos de cor ou tamanho.

### 21. `ficha_tecnica`

**Utilidade:** identificar uma versão da composição de um produto fabricado, com empresa, produto, versão, status e data de vigência.

**Relações e uso:** reúne os componentes de `ficha_tecnica_item`. Exemplo: manter a versão 1 e a versão 2 da composição de uma camiseta, permitindo consultar suas diferenças.

### 22. `ficha_tecnica_item`

**Utilidade:** detalhar cada componente de uma ficha técnica, indicando o produto componente, a quantidade e o percentual de perda previsto.

**Relações e uso:** pertence a `ficha_tecnica` e aponta para `produtos`. Exemplo: informar tecido e linha necessários à fabricação de uma peça.

### 23. `fornecedores`

**Utilidade:** manter o cadastro de quem fornece produtos ou materiais, com identificação empresarial, contatos, endereço e status.

**Relações e uso:** pode ter vínculo direto com uma empresa e participa de compras, pedidos, notas fiscais e associações em `empresa_fornecedor` e `produto_fornecedor`. Exemplo: cadastrar uma distribuidora de tecidos.

### 24. `item_nota_fiscal`

**Utilidade:** guardar cada linha de uma nota fiscal, incluindo número do item, código e descrição do produto no documento, quantidade, unidade e valores.

**Relações e uso:** pertence a `nota_fiscal` e pode ser associado a `produtos`, `cores` e `tamanhos`. O vínculo com produto é opcional, permitindo representar uma linha ainda sem associação ao catálogo interno.

### 25. `item_pedido_compra`

**Utilidade:** detalhar produtos, quantidades e valores do pedido de compra.

**Relações e uso:** liga `pedido_compra` a `produtos`. Exemplo: solicitar ao fornecedor 50 unidades de um material e registrar os valores negociados naquele pedido.

### 26. `item_requisicao_compra`

**Utilidade:** detalhar os produtos e as quantidades solicitadas internamente para compra, com observações por item.

**Relações e uso:** pertence a `requisicao_compra` e aponta para `produtos`. Exemplo: o setor de produção solicitar 30 metros de tecido. Esta tabela não registra preços.

### 27. `item_venda`

**Utilidade:** armazenar os produtos vendidos, suas quantidades e seus valores unitários e totais.

**Relações e uso:** liga `venda` a `produtos`. Há uma restrição de unicidade por venda e produto. Exemplo: uma venda contendo uma linha de camisetas e outra de calças. O modelo atual não possui cor e tamanho próprios no item.

### 28. `kardex`

**Utilidade:** manter o extrato quantitativo do estoque, registrando entrada ou saída, quantidade movimentada, saldo anterior e saldo resultante.

**Relações e uso:** cada registro aponta para uma `movimentacao_estoque` exclusiva, além de empresa, produto e, opcionalmente, local e setor. Exemplo: mostrar uma saída de 10 unidades que reduziu o saldo de 50 para 40.

### 29. `locais_estoque`

**Utilidade:** cadastrar os locais de armazenamento de cada empresa, como depósito central, loja ou almoxarifado.

**Relações e uso:** é utilizado por estoque, movimentações, reservas, compras, notas fiscais, requisições e ordens de produção. Exemplo: indicar em qual depósito uma compra será recebida.

### 30. `movimentacao_estoque`

**Utilidade:** registrar eventos que alteram o estoque, como entrada por nota fiscal, saída por venda, produção, ajuste e transferência. Guarda produto, quantidade, valor, usuário, data e referência de origem.

**Relações e uso:** associa empresa, produto, local e setor e pode possuir um registro em `kardex`. Os campos `origem_tipo` e `origem_id` identificam a origem por convenção da aplicação, sem chave estrangeira específica para cada documento.

### 31. `movimentacoes_financeiras`

**Utilidade:** registrar entradas e saídas de dinheiro em uma conta bancária ou caixa, com tipo, origem, descrição, valor e data.

**Relações e uso:** exige `empresas` e `contas_bancarias`; pode apontar para `pagamentos_receber`, `pagamentos_pagar` ou `despesas`. Exemplo: registrar a entrada de um recebimento via PIX. Também admite origens de ajuste e transferência; o pareamento das operações depende da aplicação.

### 32. `necessidade_producao`

**Utilidade:** acompanhar quanto de cada produto uma ordem de produção necessita, quanto foi reservado e quanto já foi consumido.

**Relações e uso:** possui um registro por `ordem_producao` e `produtos`, com relações para reservas e consumos. Exemplo: acompanhar uma necessidade de 100 metros de tecido, com 60 reservados e 20 consumidos.

### 33. `nota_fiscal`

**Utilidade:** guardar o cabeçalho das notas recebidas de fornecedores, com número, série, chave de acesso, datas, valor total e controle de processamento da entrada.

**Relações e uso:** pertence a empresa e fornecedor; pode estar ligada a compra, pedido, local de estoque e setor de destino. Seus produtos ficam em `item_nota_fiscal`. No schema atual, não possui vínculo direto com `venda`.

### 34. `ordem_producao`

**Utilidade:** representar uma ordem de fabricação, com número, prioridade, quantidade planejada, status, datas, responsável e observações.

**Relações e uso:** centraliza itens produzidos, planejamento de materiais, necessidades, reservas, consumos, fluxo e movimentações entre setores. Pode relacionar-se a compras e pedidos. Exemplo: organizar a fabricação de um lote de peças.

### 35. `ordem_producao_consumo_planejado`

**Utilidade:** detalhar a previsão de matéria-prima por item da ordem, registrando quantidade por peça, necessária, disponível e faltante.

**Relações e uso:** associa `ordem_producao`, `ordem_producao_item` e a matéria-prima em `produtos`. Exemplo: calcular o tecido necessário para um item de 40 camisetas. O schema armazena os resultados; os cálculos dependem da aplicação.

### 36. `ordem_producao_fluxo_setor`

**Utilidade:** definir a sequência dos setores pelos quais uma ordem deve passar.

**Relações e uso:** liga `ordem_producao` a `setores`, com uma posição de ordem. Exemplo: corte, costura e acabamento. As restrições atuais permitem cada setor uma única vez na mesma ordem de produção.

### 37. `ordem_producao_item`

**Utilidade:** detalhar os produtos de uma ordem de produção, incluindo cor, tamanho, quantidade solicitada e quantidade produzida.

**Relações e uso:** pertence a `ordem_producao`, aponta para produto e pode apontar para cor e tamanho. Também possui consumo planejado e itens de movimentação entre setores. Exemplo: 40 camisetas azuis tamanho M dentro de um lote.

### 38. `ordem_producao_movimentacao_item`

**Utilidade:** detalhar quais itens de uma ordem foram transportados em uma movimentação entre setores e em que quantidade.

**Relações e uso:** liga `ordem_producao_movimentacao_setor` a `ordem_producao_item`. Exemplo: identificar que uma transferência levou 20 peças tamanho M e 15 tamanho G.

### 39. `ordem_producao_movimentacao_setor`

**Utilidade:** registrar o envio e o recebimento de produção entre setores, incluindo destino, origem opcional, status, datas, responsáveis e observação.

**Relações e uso:** pertence a `ordem_producao`, aponta para setores e usuários e pode conter `ordem_producao_movimentacao_item`. Exemplo: acompanhar peças enviadas do corte para a costura e confirmar seu recebimento.

### 40. `pagamentos_pagar`

**Utilidade:** registrar os pagamentos efetuados para quitar uma conta a pagar, com valor, data, forma de pagamento, observação e status.

**Relações e uso:** pertence a `empresas` e `contas_pagar`, podendo ser associado a movimentações financeiras. Exemplo: quitar uma obrigação de R$ 1.000 em pagamentos de R$ 600 e R$ 400.

### 41. `pagamentos_receber`

**Utilidade:** registrar os recebimentos que quitam uma conta a receber, com valor, data, forma de pagamento, observação e status.

**Relações e uso:** pertence a `empresas` e `contas_receber`, podendo ser associado a movimentações financeiras. Exemplo: receber R$ 200 de uma parcela de R$ 500 e registrar o restante posteriormente.

### 42. `pedido_cliente`

**Utilidade:** registrar a encomenda do cliente antes e durante sua produção, venda e entrega. Guarda empresa, cliente, responsável, número, referência do cliente, status, condição de pagamento, datas, valores, endereço de entrega e observações.

**Relações e uso:** reúne itens, entregas, histórico, ordens de produção e vendas. Um pedido pode gerar várias ordens e várias vendas. Os campos de endereço guardam uma cópia do endereço acordado, além do vínculo opcional com o cadastro. Exemplo: encomendar 100 peças, fabricar em dois lotes e vender em etapas.

### 43. `pedido_cliente_entrega`

**Utilidade:** acompanhar cada remessa ou retirada de um pedido, com responsável, transportadora, rastreamento, previsão, envio, entrega e confirmação de recebimento.

**Relações e uso:** pertence a um pedido e contém itens e quantidades em `pedido_cliente_entrega_item`. Permite registrar nome do recebedor, comprovante e ocorrência de falha. `ENTREGUE` indica a entrega registrada; `RECEBIMENTO_CONFIRMADO` indica que o recebimento pelo cliente foi confirmado.

### 44. `pedido_cliente_entrega_item`

**Utilidade:** registrar as quantidades de cada item incluídas em uma entrega, possibilitando entregas parciais e o acompanhamento do saldo a entregar.

**Relações e uso:** associa a entrega ao item do pedido. As chaves estrangeiras compostas garantem que ambos pertençam ao mesmo pedido. Exemplo: entregar 30 unidades de um item de 100 e registrar as 70 restantes em outra remessa. A prevenção de quantidades excessivas depende da aplicação.

### 45. `pedido_cliente_historico`

**Utilidade:** preservar o histórico das mudanças de status do pedido, com estado anterior, novo estado, responsável, data e observação.

**Relações e uso:** pertence a `pedido_cliente` e `usuarios`. Exemplo: registrar quem confirmou a encomenda e quando ela entrou em produção. A aplicação deve gravar o histórico na mesma transação que altera o status; o schema não o gera automaticamente.

### 46. `pedido_cliente_item`

**Utilidade:** detalhar cada linha encomendada, com produto, cor, tamanho, descrição e código acordados, unidade, quantidade, preço, desconto, acréscimo, total e prazo.

**Relações e uso:** pertence ao pedido e pode ser referenciado por itens de ordens de produção, itens de venda e entregas. O número da linha é único dentro do pedido, permitindo repetir um produto com variações ou condições diferentes. Os preços e a descrição são registros do acordo comercial, sem depender de alterações posteriores no catálogo.

### 47. `pedido_compra`

**Utilidade:** registrar o pedido encaminhado ao fornecedor, com empresa, responsável, número, data, status e observações.

**Relações e uso:** reúne `item_pedido_compra`, pode partir de uma requisição ou ordem de produção e se relaciona a notas fiscais. O campo `id_pedido_compra_legado` de `compras` permite vincular esse pedido a uma compra; sua unicidade limita esse vínculo a uma compra por pedido.

### 48. `permissoes_setor`

**Utilidade:** registrar os recursos associados às permissões de um setor.

**Relações e uso:** pertence a `setores` e guarda um nome de recurso em texto, único por setor. Exemplo: associar o recurso de estoque ao almoxarifado. O modelo não separa operações de leitura, criação, edição e exclusão.

### 49. `permissoes_usuario`

**Utilidade:** definir se um usuário pode ler, criar, editar e excluir registros de determinado recurso dentro de uma empresa.

**Relações e uso:** pertence a `usuario_empresa`, permitindo permissões diferentes para a mesma pessoa em empresas diferentes. Os recursos permitidos são definidos pelo enum `permissoes_usuario_recurso`. Exemplo: permitir consulta de estoque sem permitir exclusão.

### 50. `produto_empresa`

**Utilidade:** guardar a configuração comercial e de estoque de um produto em uma empresa: código interno, preço de venda, custo, valor do estoque, limites mínimo e máximo e status.

**Relações e uso:** associa `produtos` a `empresas`, com cor e tamanho opcionais. Exemplo: manter preços diferentes para o mesmo produto em empresas diferentes. A unicidade atual é por empresa/produto, permitindo apenas um registro desse par.

### 51. `produto_fornecedor`

**Utilidade:** guardar as condições de fornecimento de um produto por um fornecedor para uma empresa, como código usado pelo fornecedor, último preço de compra, prazo, quantidade mínima e indicação de fornecedor principal.

**Relações e uso:** conecta `empresas`, `produtos` e `fornecedores`. Exemplo: consultar qual fornecedor entrega determinado tecido e qual foi o último preço registrado.

### 52. `produto_variacoes`

**Utilidade:** cadastrar combinações de produto, cor e tamanho disponíveis em uma empresa, com status.

**Relações e uso:** associa `empresas`, `produtos`, `cores` e `tamanhos`. Exemplo: indicar que uma camiseta existe em azul/M e azul/G. Esta tabela não guarda preço nem saldo de estoque por combinação.

### 53. `produtos`

**Utilidade:** manter o catálogo principal de produtos e materiais, com tipo, categoria, nome, código, descrição, unidade e flags de controle de estoque, venda, compra e produção.

**Relações e uso:** é referenciado por compras, vendas, estoque, notas e produção. Dados específicos por empresa ficam em `produto_empresa`. Exemplo: cadastrar tanto o tecido utilizado quanto a camiseta fabricada.

### 54. `refresh_tokens`

**Utilidade:** guardar tokens de renovação de sessão, com datas de criação e expiração, revogação, IP e identificação do cliente de acesso.

**Relações e uso:** cada token pertence a `usuarios`. Exemplo: permitir que a aplicação renove uma sessão válida ou identifique um token revogado. A validação e a renovação efetivas são responsabilidade da autenticação da aplicação.

### 55. `requisicao_compra`

**Utilidade:** registrar uma solicitação interna de aquisição, com empresa, usuário solicitante, setor e local opcionais, número, status, data e observação.

**Relações e uso:** reúne `item_requisicao_compra` e pode originar `pedido_compra`. Exemplo: o setor de costura solicitar reposição de linhas ao responsável pelas compras.

### 56. `reserva_estoque`

**Utilidade:** registrar a quantidade de um produto comprometida com uma venda ou ordem de produção, incluindo origem, status, responsável e datas.

**Relações e uso:** conecta empresa e produto a venda, ordem ou necessidade de produção, com local e setor opcionais. Pode ser usada em `consumo_producao`. Exemplo: reservar material para uma ordem antes de consumi-lo.

### 57. `sequencias_automaticas`

**Utilidade:** guardar o último número utilizado por empresa e entidade, servindo de base à geração de numerações sequenciais.

**Relações e uso:** pertence a `empresas` e usa empresa/entidade como chave composta. Exemplo: manter contadores separados para vendas e ordens de produção. A atualização segura do contador deve ser implementada pela aplicação.

### 58. `setores`

**Utilidade:** cadastrar os setores de cada empresa, com nome, tipo, descrição e status.

**Relações e uso:** participa de vínculos de usuários, permissões, estoque, requisições, consumo e fluxo de produção. Exemplos: corte, costura, acabamento e almoxarifado. O tipo é armazenado em um campo de texto.

### 59. `tamanhos`

**Utilidade:** cadastrar os tamanhos usados pela empresa, com descrição, ordem de apresentação e status.

**Relações e uso:** é utilizado por variações de produto, configuração por empresa e itens de compras, notas e produção. Exemplo: apresentar P, M e G na ordem comercial desejada.

### 60. `tipos_produto`

**Utilidade:** manter classificações de tipo de produto, com nome e descrição.

**Relações e uso:** é referenciado por `produtos` e não possui vínculo direto com empresa. Exemplos possíveis de cadastro: matéria-prima e produto acabado. Os nomes são registros de cadastro, não valores fixos de enum.

### 61. `tipos_setor`

**Utilidade:** cadastrar os nomes de tipos de setor disponíveis para cada empresa, com status.

**Relações e uso:** pertence a `empresas`. Pode servir como catálogo de opções para o campo `tipo` de `setores`, mas o schema não possui chave estrangeira entre essas duas tabelas; a correspondência depende da aplicação.

### 62. `usuario_empresa`

**Utilidade:** vincular um usuário a uma empresa, indicando cargo, setor opcional, nível de acesso, status e data do vínculo.

**Relações e uso:** conecta `usuarios`, `empresas`, `cargos` e `setores`, e reúne `permissoes_usuario`. Exemplo: uma pessoa ser gerente em uma empresa e ter outra função em uma segunda empresa.

### 63. `usuarios`

**Utilidade:** manter a identidade de acesso dos usuários, com nome, e-mail, senha, nível de acesso, status e data de cadastro.

**Relações e uso:** participa de vínculos com empresas, sessões, auditoria e registros operacionais como vendas, compras e movimentações. Exemplo: identificar o usuário responsável por uma venda ou pelo envio de peças entre setores.

### 64. `venda`

**Utilidade:** representar o documento principal de venda, com cliente, empresa, responsável, número, datas, canal, status operacional e financeiro e valores de subtotal, desconto, frete, acréscimo e total.

**Relações e uso:** reúne `item_venda`, `reserva_estoque` e `contas_receber`; pode ter condição de pagamento e endereço de entrega. Exemplo: registrar uma venda pelo WhatsApp, com entrega e pagamento parcelado.

## Diferenças entre tabelas próximas

| Conjunto | Papel de cada tabela |
| --- | --- |
| `produtos`, `produto_empresa`, `produto_variacoes` | Cadastro principal; configuração comercial por empresa; combinações de cor e tamanho. |
| `fornecedores`, `empresa_fornecedor`, `produto_fornecedor` | Cadastro do fornecedor; condições gerais por empresa; condições para um produto específico. |
| `estoque`, `reserva_estoque`, `movimentacao_estoque`, `kardex` | Posição de quantidades; compromissos de uso; eventos de entrada/saída; extrato com saldo antes e depois. |
| `requisicao_compra`, `pedido_compra`, `compras`, `nota_fiscal` | Solicitação interna; pedido ao fornecedor; documento de compra; documento fiscal recebido. Os vínculos opcionais permitem caminhos diferentes. |
| `ficha_tecnica_item`, `ordem_producao_consumo_planejado`, `necessidade_producao`, `consumo_producao` | Composição do produto; previsão por item da ordem; acompanhamento da necessidade por produto na ordem; apontamento de consumo. |
| `ordem_producao_fluxo_setor`, `ordem_producao_movimentacao_setor` | Sequência prevista de setores; histórico dos envios e recebimentos. |
| `contas_receber`, `pagamentos_receber`, `movimentacoes_financeiras` | Valor devido pelo cliente; recebimentos realizados; entradas ou saídas registradas na conta financeira. |
| `contas_pagar`, `pagamentos_pagar`, `despesas` | Obrigações vinculadas a compras; pagamentos realizados; registro e classificação de gastos, com vínculo opcional à obrigação. |

## Exemplos de funcionamento conjunto

### Venda parcelada

1. O comprador fica em `clientes`; os produtos negociados ficam em `item_venda`, vinculados a `venda`.
2. A condição selecionada em `condicoes_pagamento` pode orientar o parcelamento.
3. A aplicação cria as parcelas em `contas_receber`.
4. Cada recebimento é registrado em `pagamentos_receber`.
5. A entrada de dinheiro é registrada em `movimentacoes_financeiras`, vinculada à conta em `contas_bancarias`.

### Compra e recebimento de materiais

1. Uma necessidade interna pode ser registrada em `requisicao_compra` e `item_requisicao_compra`.
2. Um pedido pode ser documentado em `pedido_compra` e seus itens; uma compra pode ser registrada em `compras` e `compra_itens`, com vínculo opcional ao pedido legado.
3. A nota recebida fica em `nota_fiscal` e `item_nota_fiscal`.
4. O processamento do recebimento pode registrar `movimentacao_estoque`, atualizar `estoque` e produzir o extrato em `kardex`.
5. As obrigações da compra ficam em `contas_pagar`; os pagamentos ficam em `pagamentos_pagar`, e suas saídas de dinheiro em `movimentacoes_financeiras`.

### Produção de um lote

1. A composição do produto pode ser consultada em `ficha_tecnica` e `ficha_tecnica_item`.
2. O lote é registrado em `ordem_producao` e `ordem_producao_item`.
3. O planejamento por item fica em `ordem_producao_consumo_planejado`, e o acompanhamento de materiais por ordem/produto fica em `necessidade_producao`.
4. Os materiais comprometidos ficam em `reserva_estoque`, e os consumidos em `consumo_producao`.
5. A sequência prevista fica em `ordem_producao_fluxo_setor`; os envios e recebimentos ficam nas tabelas de movimentação da ordem.
6. A aplicação pode registrar as entradas dos produtos fabricados em `movimentacao_estoque`, com atualização do saldo e do extrato.

Esses fluxos explicam como as tabelas podem trabalhar juntas. O schema define onde guardar as informações e como relacioná-las; ele não executa sozinho o parcelamento, a baixa de estoque, a quitação de contas ou a atualização de saldos.


## Pedidos de clientes: vínculos e regras de uso

### Pedido, produção e venda

- `venda.id_pedido_cliente` identifica o pedido que originou a venda. É opcional para preservar vendas avulsas e existentes; nas vendas originadas de pedido, deve ser preenchido.
- `item_venda.id_pedido_cliente_item` identifica a linha encomendada. A quantidade e os valores da operação continuam no item da venda, permitindo consultar quanto do pedido já foi vendido.
- `ordem_producao.id_pedido_cliente` identifica a encomenda atendida pela ordem; `ordem_producao_item.id_pedido_cliente_item` identifica a linha produzida. Cada ordem atende, neste desenho, no máximo um pedido, e um pedido pode ter várias ordens.
- O financeiro continua ligado a `venda`: pedido → vendas → contas a receber → recebimentos. Criar o pedido não gera cobrança automaticamente.
- As relações opcionais preservam operações existentes sem pedido. Para operações de pedido, a aplicação deve verificar que cabeçalho e itens apontam para o mesmo pedido, produto, empresa e cliente. Também deve validar a empresa dos cadastros e das variações utilizados.
- O schema existente de `item_venda` mantém sua unicidade por venda/produto. Assim, duas linhas de pedido com o mesmo produto não podem ser lançadas separadamente na mesma venda, mesmo que tenham cores ou tamanhos diferentes. Esse caso exige vendas separadas no desenho atual; não houve alteração dessa regra preexistente.

### Valores do pedido

- Total de uma linha: quantidade × valor unitário − desconto da linha + acréscimo da linha, arredondado para duas casas decimais.
- Subtotal do pedido: soma dos totais das linhas, já considerando seus descontos e acréscimos.
- Total do pedido: subtotal − desconto geral + frete + acréscimo geral. Os ajustes gerais são adicionais aos ajustes das linhas.
- A aplicação deve calcular os valores com aritmética decimal, rejeitar quantidades não positivas e valores incompatíveis, e evitar alterações em itens já vendidos, produzidos ou entregues sem tratar seus efeitos.

### Andamento e recebimento

O status do pedido permite acompanhar `RASCUNHO`, `CONFIRMADO`, `EM_PRODUCAO`, `PRONTO`, `EM_ENTREGA`, `PARCIALMENTE_ENTREGUE`, `ENTREGUE`, `CONCLUIDO` e `CANCELADO`. O caminho pode variar: produtos disponíveis em estoque podem dispensar produção.

Cada entrega possui seu próprio status. Para apurar quantidades entregues, considerar apenas remessas `ENTREGUE` ou `RECEBIMENTO_CONFIRMADO`; para apurar recebimento confirmado pelo cliente, considerar apenas `RECEBIMENTO_CONFIRMADO`. Não somar remessas canceladas ou não entregues. Antes de preparar ou enviar uma remessa, descontar também as quantidades já comprometidas em remessas ativas, evitando expedição duplicada.

A aplicação deve manter `PARCIALMENTE_ENTREGUE` enquanto apenas parte das quantidades tiver sido entregue, usar `ENTREGUE` quando todas tiverem sido entregues e permitir `CONCLUIDO` quando o recebimento de todas as quantidades tiver sido confirmado. Registrar a data de confirmação e o recebedor em cada remessa confirmada; o comprovante pode ser anexado por URL. A conclusão operacional não significa que todas as contas foram pagas.

As verificações de quantidades e transições de status devem ocorrer em transações com controle de concorrência. As datas do pedido e o histórico devem acompanhar essas alterações. O schema disponibiliza os campos, enums e relações; as verificações de negócio e os cálculos precisam ser implementados na aplicação.
