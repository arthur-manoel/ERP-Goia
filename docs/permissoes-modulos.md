# Permissões dos módulos — issue #13

O enum publicado na `develop` e o SQL
`20261022000000_ampliar_recursos_permissoes` já contêm, nesta ordem:

`PRODUTOS`, `ESTOQUE`, `NOTAS_FISCAIS`, `ORDENS_PRODUCAO`, `CORES`, `MODELOS`,
`CATEGORIAS`, `CLIENTES`, `PEDIDOS`, `FINANCEIRO`, `COMPRAS`, `FORNECEDORES`,
`SETORES`, `VENDAS`, `RELATORIOS`, `FLUXOS_PRODUCAO`, `TAMANHOS`, `TIPOS_PRODUTO`.

As quatro flags continuam booleanas, com padrão `false`. Esta entrega não cria
concessões, não copia permissões antigas e não cria administrador. Um responsável
autorizado deve atribuir explicitamente cada novo recurso no vínculo correto.
Ter `PRODUTOS` não concede `TAMANHOS`; ter `ORDENS_PRODUCAO` não concede
`SETORES`/`FLUXOS_PRODUCAO`; ter `ESTOQUE` não concede `COMPRAS`.

## Contexto e exceções

Cada entrada valida Bearer JWT, os perfis funcionais já aceitos por seu módulo,
usuário ativo, vínculo ativo e empresa ativa. Cargo ou permissão no JSON não
autoriza operação. As exceções administrativas existentes são usuário com
`usuarios.nivel_acesso = ADMIN` ou vínculo com `nivel_acesso = EMPRESA`; mesmo
esses precisam de vínculo ativo com a empresa. Perfil `ADMINISTRACAO` no JWT,
isoladamente, não constitui essa exceção.

Empresa **S**: `X-Empresa-Id` seleciona um vínculo ativo; com vários vínculos,
omitir o header retorna 400. Consultas e gravações filtram a empresa selecionada.

Empresa **C**: catálogos/financeiro consultam somente as empresas autorizadas
para o recurso e a flag; header, quando enviado, restringe esse conjunto.
Corpo/filtro de empresa não autorizada retorna 403; ID inacessível retorna 404.
Produto compartilhado exige permissão em todas as empresas vinculadas para
alteração/inativação. Tipos de produto são um catálogo global no modelo atual:
exigem `TIPOS_PRODUTO` em vínculo ativo, mas não possuem `id_empresa` por linha.

## Matriz de entradas

Todos os caminhos abaixo começam com `/api`. **L** = `pode_ler`, **C** =
`pode_criar`, **E** = `pode_editar`, **X** = `pode_excluir`. Exceção **A** =
as duas exceções administrativas acima, sempre mantendo vínculo ativo.

Cobertura **I**: [inventário de entradas](../tests/unit/permissoes/entradas.test.ts)
executa todos os métodos exportados, negando JWT ausente e vínculo/permissão
ausente. **M**: [matriz de autorização](../tests/unit/permissoes/authorization.test.ts).
**B**: [integração com banco real](../tests/permissoes-perdas.integration.test.mjs),
incluindo os 18 recursos × quatro flags, ativos, isolamento e entradas dos oito
novos recursos. As suítes próprias indicadas cobrem operações e regras adicionais.

| Caminho | Operação / método | Recurso / flag | Empresa | Exceção | Cobertura |
| --- | --- | --- | --- | --- | --- |
| `/produtos`, `/produtos/{id}` | GET | PRODUTOS / L | C | A | I, M, B, unit/catalogos |
| `/produtos` | POST | PRODUTOS / C | C | A | I, unit/catalogos |
| `/produtos/{id}` | PUT, PATCH; DELETE | PRODUTOS / E; X | C | A | I, unit/catalogos |
| `/cores`, `/cores/{id}` | GET | CORES / L | C | A | I, M, B, unit/catalogos |
| `/cores` | POST | CORES / C | C | A | I, unit/catalogos |
| `/cores/{id}` | PUT, PATCH; DELETE | CORES / E; X | C | A | I, unit/catalogos |
| `/tamanhos`, `/tamanhos/{id}` | GET | TAMANHOS / L | C | A | I, M, B, unit/catalogos |
| `/tamanhos` | POST | TAMANHOS / C | C | A | I, unit/catalogos |
| `/tamanhos/{id}` | PUT, PATCH; DELETE | TAMANHOS / E; X | C | A | I, unit/catalogos |
| `/tipos_produto`, `/tipos_produto/{id}` | GET | TIPOS_PRODUTO / L | C, global | A | I, M, B, unit/tipos_produto |
| `/tipos_produto` | POST | TIPOS_PRODUTO / C | C, global | A | I, unit/tipos_produto |
| `/tipos_produto/{id}` | PUT, PATCH; DELETE | TIPOS_PRODUTO / E; X | C, global | A | I, unit/tipos_produto |
| `/fornecedores`, `/fornecedores/{id}` | GET | FORNECEDORES / L | C | A | I, M, B, unit/fornecedores |
| `/fornecedores` | POST | FORNECEDORES / C | C | A | I, unit/fornecedores |
| `/fornecedores/{id}` | PUT, PATCH; DELETE | FORNECEDORES / E; X | C | A | I, unit/fornecedores |
| `/categorias`, `/categorias/{id}` | GET | CATEGORIAS / L | C | A | I, M, B, unit/categorias |
| `/categorias` | POST | CATEGORIAS / C | C | A | I, unit/categorias |
| `/categorias/{id}` | PUT, PATCH; DELETE | CATEGORIAS / E; X | C | A | I, unit/categorias |
| `/clientes`, `/clientes/{id}` | GET | CLIENTES / L | S | A | I, clientes.test.mjs |
| `/clientes` | POST | CLIENTES / C | S | A | I, clientes.test.mjs |
| `/clientes/{id}` | PATCH; DELETE | CLIENTES / E; X | S | A | I, clientes.test.mjs |
| `/clientes/{id}/pedidos` | GET do histórico persistido em venda/item_venda | CLIENTES / L **e** VENDAS / L | S | A | I, M, B, clientes.test.mjs |
| `/pedidos`, `/pedidos/{id}` | GET | PEDIDOS / L | S | A | I, unit/pedidos |
| `/pedidos` | POST | PEDIDOS / C | S | A | I, unit/pedidos |
| `/pedidos/{id}` | PATCH | PEDIDOS / E | S | A | I, unit/pedidos |
| `/pedidos/{id}/itens` | POST, inclusão no pedido existente | PEDIDOS / E | S | A | I, unit/pedidos |
| `/pedidos/{id}/itens/{idItem}` | PATCH; DELETE | PEDIDOS / E; E **e** X | S | A | I, unit/pedidos |
| `/pedidos/{id}/fechar` | POST, fechamento comercial | PEDIDOS / E | S | A | I, unit/pedido-recebiveis |
| `/pedidos/{id}/conta-a-receber` | GET | FINANCEIRO / L | S | A | I, unit/pedido-recebiveis |
| `/contas_receber`, `/contas_pagar`, `/despesas`, e respectivos `/{id}` | GET | FINANCEIRO / L | C | A | I, unit/contas_receber, unit/contas_pagar, unit/despesas |
| `/contas_receber`, `/contas_pagar`, `/despesas` | POST | FINANCEIRO / C | C | A | I, suítes acima |
| `/contas_receber/{id}`, `/contas_pagar/{id}`, `/despesas/{id}` | PUT, PATCH; DELETE | FINANCEIRO / E; X | C | A | I, suítes acima, unit/financeiro |
| `/compras/requisicoes`, `/compras/pedidos`, `/compras/compras`, e respectivos `/{id}` | GET | COMPRAS / L | S | A | I, M, B |
| `/compras/requisicoes`, `/compras/pedidos`, `/compras/compras` | POST | COMPRAS / C | S | A | I, M, B |
| `/compras/requisicoes/{id}`, `/compras/pedidos/{id}` | PATCH | COMPRAS / E | S | A | I, M, B |
| `/compras/requisicoes/{id}/acao`, `/compras/pedidos/{id}/acao`, `/compras/compras/{id}/acao` | POST de envio, aprovação, emissão ou cancelamento, conforme documento | COMPRAS / E | S | A | I, M, B |
| `/compras/compras/{id}/receber` | POST, recebimento | COMPRAS / E | S | A | I, M, B |
| `/compras/notas-fiscais`, `/compras/notas-fiscais/{id}` | GET | NOTAS_FISCAIS / L | S | A | I, M, B |
| `/compras/notas-fiscais` | POST | NOTAS_FISCAIS / C | S | A | I, M, B |
| `/compras/notas-fiscais/{id}` | PATCH | NOTAS_FISCAIS / E | S | A | I, M, B |
| `/compras/notas-fiscais/{id}/acao` | POST, ações do documento | NOTAS_FISCAIS / E | S | A | I, M, B |
| `/compras/opcoes` | GET, seletores para compras/notas | COMPRAS / L **ou** NOTAS_FISCAIS / L | S | A | I, M, B |
| `/estoque`, `/estoque/{id}` | GET | ESTOQUE / L | S | A | I, unit/estoque |
| `/estoque` | POST, vínculo com saldo inicial zero | ESTOQUE / C | S | A | I, unit/estoque |
| `/estoque/saldo` | GET de saldo físico/reservado/disponível | ESTOQUE / L | S | A | I, unit/movimentacoes-estoque (develop a5d3b72) |
| `/estoque/entradas`, `/estoque/saidas` | POST de movimentação | ESTOQUE / L **e** C | S | A | I, unit/movimentacoes-estoque (develop a5d3b72) |
| `/estoque/ajustes` | POST de ajuste | ESTOQUE / L **e** E | S | A | I, unit/movimentacoes-estoque (develop a5d3b72) |
| `/estoque/movimentacoes/opcoes` | GET de opções demonstrativas autenticadas | ESTOQUE / L | S | A | I, unit/movimentacao/opcoes |
| `/estoque-minimo` | GET; PUT de configuração | ESTOQUE / L; E | S | A | I, unit/estoque, estoque-minimo.integration.test.mjs |
| `/estoque-minimo/empresas` | GET de vínculos autorizados para estoque | ESTOQUE / L por vínculo retornado | Cada vínculo | A | I, unit/estoque |
| `/relatorios/estoque/produtos` | GET | RELATORIOS / L **e** ESTOQUE / L | S | A | I, M, B, relatorio-estoque.integration.test.mjs |
| `/setores`, `/setores/{id}` | GET | SETORES / L | S | A | I, M, B |
| `/setores` | POST | SETORES / C | S | A | I, M, B |
| `/setores/{id}` | PATCH; DELETE | SETORES / E; X | S | A | I, M, B |
| `/fluxos-producao`, `/fluxos-producao/{id}` | GET | FLUXOS_PRODUCAO / L | S | A | I, M, B |
| `/fluxos-producao` | POST | FLUXOS_PRODUCAO / C | S | A | I, M, B |
| `/fluxos-producao/{id}` | PATCH; DELETE | FLUXOS_PRODUCAO / E; X | S | A | I, M, B |
| `/produtos/{id}/fluxo` | GET; PUT de associação; DELETE de desassociação | PRODUTOS / L; E; E | S | A | I, producao.test.mjs |
| `/ordens-producao` | POST de abertura | ORDENS_PRODUCAO / C | S | A | I, producao.test.mjs |
| `/ordens-producao/{id}` | GET; PATCH | ORDENS_PRODUCAO / L; E | S | A | I, producao.test.mjs |
| `/ordens-producao/{id}/avancar`, `/ordens-producao/{id}/encerrar`, `/ordens-producao/{id}/etapas/iniciar`, `/ordens-producao/{id}/etapas/concluir` | POST | ORDENS_PRODUCAO / E | S | A | I, producao.test.mjs |
| `/ordens-producao/{id}/apontamentos` | GET; POST | ORDENS_PRODUCAO / L; E | S | A | I, M, B |
| `/ordens-producao/{id}/apontamentos/{idApontamento}/corrigir`, `/ordens-producao/{id}/apontamentos/{idApontamento}/estornar` | POST | ORDENS_PRODUCAO / E | S | A | I, M, B |
| `/ordem_producao`, `/ordem_producao/{id}` | GET de ordens/cabeçalho | ORDENS_PRODUCAO / L | S | A | I, unit/ordem_producao |
| `/ordem_producao` | POST de cadastro | ORDENS_PRODUCAO / C | S | A | I, unit/ordem_producao |
| `/ordem_producao/{id}` | PUT, PATCH; DELETE de cancelamento lógico | ORDENS_PRODUCAO / E; X | S | A | I, unit/ordem_producao |
| `/ordem_producao/{id}/liberar`, `/ordem_producao/{id}/iniciar`, `/ordem_producao/{id}/pausar`, `/ordem_producao/{id}/retomar`, `/ordem_producao/{id}/replanejar`, `/ordem_producao/{id}/concluir` | POST de ciclo de vida | ORDENS_PRODUCAO / E | S | A | I, unit/ordem_producao |
| `/ordem_producao/{id}/itens`, `/ordem_producao/{id}/etapas` | GET paginado | ORDENS_PRODUCAO / L | S | A | I, unit/ordem_producao |
| `/ordem_producao/{id}/itens` | POST de inclusão | ORDENS_PRODUCAO / C | S | A | I, unit/ordem_producao |
| `/ordem_producao/{id}/itens/{itemId}` | PATCH; DELETE no planejamento | ORDENS_PRODUCAO / E; X | S | A | I, unit/ordem_producao |
| `/ordem_producao/{id}/itens/{itemId}/producao` | PUT da quantidade final efetiva, independente do histórico de perdas | ORDENS_PRODUCAO / E | S | A | I, unit/ordem_producao |
| `/ordem_producao/{id}/etapas/{etapaId}/iniciar`, `/ordem_producao/{id}/etapas/{etapaId}/concluir` | POST | ORDENS_PRODUCAO / E | S | A | I, unit/ordem_producao |

Inativar por POST/PUT/PATCH exige também X nos catálogos, clientes e setores/
fluxos. Cancelar título/despesa por edição exige E+X, preservando a verificação
na origem e no destino. Ações de cancelamento dos documentos de compras seguem
a política já existente de E; não foi criada uma ação nova no enum.

O fechamento comercial pode gerar títulos como consequência transacional,
mas não concede leitura financeira. Seletores de compras/notas fornecem somente
identificação necessária ao documento, com paginação e empresa; não concedem CRUD
de fornecedores/produtos/setores nem acesso irrestrito às suas APIs.

Relatórios exigem leitura de `RELATORIOS` e de cada domínio exposto, no mesmo
vínculo. Permissões de empresas diferentes não se somam. Indicadores futuros
devem seguir essa regra antes de receber consultas reais.

## Entradas especiais e caminhos alternativos

| Entrada | Segurança / situação | Cobertura |
| --- | --- | --- |
| POST `/auth/login` | Credenciais, hash, status e perfil atual; não exige módulo para entrar | auth.test.mjs |
| POST `/auth/refresh` | Cookie/token de refresh, rotação e detecção de reuso | auth.test.mjs |
| POST `/auth/logout` | Revogação do refresh; não exige módulo | auth.test.mjs |
| GET `/auth/contexto` | JWT e vínculos ativos; seleção de empresa, sem dados de negócio | unit/autenticacao, auth.test.mjs |
| POST `/usuarios` | JWT e administração efetiva no banco, com vínculo ativo; não há recurso USUARIOS no enum | I, usuarios.test.mjs |

`/estoque-minimo/empresas` pode retornar 200 com lista vazia: filtra os vínculos
por ESTOQUE/L e não entrega saldos. Isso não é autorização para outra entrada.

Não há API de negócio autônoma para `MODELOS`, nem CRUD de vendas separado do
histórico atual; o valor legado MODELOS foi preservado, sem inventar endpoints.
Não há exportações ou operações em lote públicas adicionais no checkout.
Routers delegam às mesmas verificações; repositories/services são internos,
não Server Actions. Não foram encontradas Server Actions com escrita real ou
consultas Prisma de negócio expostas diretamente nas páginas.

As telas que usam `createMockApi`/`useErp` continuam demonstrações locais do
frontend. Os indicadores reais do dashboard ainda lançam erro de não integração;
o financeiro nega por padrão e mocks ficam desligados em produção. Não se usou
esses placeholders como prova de integração real. Novas telas e sua conexão às
APIs ficam fora desta entrega de backend/banco.

As quatro entradas de movimentação acima foram incorporadas à `develop` durante
esta implementação. Seu autorizador próprio já exige leitura junto da ação de
escrita, pois a resposta contém saldos; não foi substituído nem duplicado nesta
entrega. A validação do inventário também as cobre quando executada com essa base.

As URLs `/ordem_producao` e a remoção da sessão provisória entraram depois,
na base 68639fd. O autorizador de produção mantém o rate limiting compartilhado
dessas URLs e das legadas, inclusive setores/fluxos e apontamentos. A opção de
movimentação ainda entrega dados demonstrativos após autenticação, não dados de
estoque persistidos; não foi usada como prova de integração real do estoque.

## Banco e verificação local

Conferir `SHOW CREATE TABLE permissoes_usuario` e os 18 valores antes de aplicar
o SQL do enum em outro ambiente. Não repetir uma alteração já aplicada e não
adotar automaticamente o histórico de migrations de um banco compartilhado.
O roteiro de banco e os comandos locais estão no
[contrato de apontamentos](../src/modules/apontamentos/README.md).

**DDL testado localmente não significa DDL aplicado no banco compartilhado ou em produção.**
