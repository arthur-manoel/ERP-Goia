# Empresa–fornecedor

Gerenciamento de vínculos e condições comerciais entre a empresa autenticada e fornecedores globais. Backend em `src/modules/empresa-fornecedor`, tela em `src/features/empresa-fornecedor`. Implementação baseada nos módulos funcionais de categorias, clientes e compras, conforme CONTRIBUTING e docs/ARQUITETURA. Nenhuma mudança em Prisma, migrations ou dependências.

## Acesso

Tela: `/cadastros/empresa-fornecedor`, disponível no menu Cadastros e pelo botão Condições comerciais do cadastro de fornecedores. Utiliza os componentes compartilhados já disponíveis em `src/components/ui`, o provider de autenticação e os hooks de consulta existentes. Não incorpora componentes de branches ainda não integradas.

Todas as rotas usam o `catalogRequest` existente: Bearer JWT válido, usuário ativo, vínculo ativo, empresa ativa e permissão `FORNECEDORES` por operação. ADMIN global e vínculo EMPRESA dispensam permissão explícita, mas não o vínculo ativo. `X-Empresa-Id` apenas seleciona uma empresa autorizada; sem header, só é aceito um único vínculo autorizado. Corpo e filtros rejeitam `id_empresa`.

O helper legado `getEmpresaAtual()` depende de DEV_ID_* e não pode sustentar APIs em produção, conforme docs/ARQUITETURA. Este módulo usa o contexto oficial das APIs autenticadas: JWT + vínculo no banco + X-Empresa-Id, também utilizado pelo provider da interface. Empresa e usuário nunca vêm do corpo.

Permissões: leitura `pode_ler`; POST `pode_criar`; PUT/PATCH `pode_editar`; DELETE `pode_excluir`. Inativação por PUT/PATCH exige também `pode_excluir`, evitando contornar a permissão de exclusão por alteração de status. Reativação por PATCH exige edição; por POST exige criação, conforme o contrato da operação. As permissões são revalidadas dentro das transações de escrita.

Rate limiting existente por usuário autenticado/processo: 120 leituras e 30 escritas por minuto. Não utiliza texto de tokens inválidos nem X-Forwarded-For para identificar o usuário. O armazenamento não é distribuído entre instâncias.

## Endpoints

| Método | URL | Operação |
| --- | --- | --- |
| GET | `/api/empresa-fornecedor` | Associações paginadas da empresa ativa |
| POST | `/api/empresa-fornecedor` | Criar associação ou reativar a existente |
| GET | `/api/empresa-fornecedor/{id}` | Consultar associação da empresa ativa |
| PUT | `/api/empresa-fornecedor/{id}` | Substituir integralmente as condições comerciais |
| PATCH | `/api/empresa-fornecedor/{id}` | Alterar somente os campos enviados |
| DELETE | `/api/empresa-fornecedor/{id}` | Inativar logicamente, de forma idempotente |
| GET | `/api/empresa-fornecedor/fornecedores` | Descoberta paginada de globais disponíveis ou específicos da empresa |

Respostas usam o helper global com NextResponse: `{ success: true, data }` ou `{ success: false, error }`, Cache-Control no-store. POST retorna 201 (incluindo reativação); consultas e demais operações retornam 200. Erros: 400 para entrada/fornecedor inválido, 401 sem JWT, 403 sem vínculo/permissão, 404 para associação inexistente ou fora da empresa, 409 para duplicidade/disputa de gravação, 429 para limite e 500 genérico com log interno. Não são expostos SQL ou stack traces.

### POST

```json
{
  "id_fornecedor": 50,
  "prazo_pagamento": 30,
  "prazo_entrega": 5,
  "observacao": "Entregar somente pela manhã"
}
```

O fornecedor deve ser global (`id_empresa = null`) e ATIVO. Específicos de qualquer empresa não podem ser associados, inclusive os da própria empresa. POST resulta em ATIVO; se status for enviado, deve ser ATIVO. Associação ativa existente retorna 409. Associação inativa é reativada preservando ID, atualizando apenas condições enviadas; campos omitidos permanecem inalterados. Na criação, opcionais omitidos são nulos.

Prazos são inteiros em dias, de zero até o limite signed INT do MySQL: null = não informado, 0 = imediato. Não representam parcelas nem uma condição financeira completa. Observação é nula ou texto de até 255 caracteres, sem espaços nas extremidades.

### PUT e PATCH

PUT exige `prazo_pagamento`, `prazo_entrega`, `observacao` e `status`. Campos opcionais devem ser enviados como null para limpeza. PATCH exige ao menos um campo editável: omissão preserva, null limpa, valor substitui. `id`, `id_empresa` e `id_fornecedor` são imutáveis. Status aceita ATIVO/INATIVO. Reativação exige fornecedor global ainda ativo.

DELETE altera somente status para INATIVO; repetir a operação retorna sucesso sem nova escrita/auditoria. Não remove fornecedores, associações, compras, notas ou pagamentos. IDs de outras empresas retornam 404.

### Listagem

Parâmetros: `page` (default 1), `limit` (default 20, máximo 100), `id_fornecedor`, `status`, `busca`, `nome`, `cnpj`, `ordenar_por` e `ordem` (asc/desc). Busca inclui razão social, fantasia e CNPJ, considerando documentos com e sem máscara. Ordenação aceita somente id, fornecedor, prazo_pagamento, prazo_entrega ou status, com ID como desempate. Skip e IDs são limitados ao intervalo suportado. Parâmetros repetidos/desconhecidos são rejeitados.

```json
{
  "success": true,
  "data": { "rows": [], "count": 0, "page": 1, "limit": 20, "totalPages": 0 }
}
```

Os registros incluem os campos da associação e os dados mínimos do fornecedor global (`fornecedores`). Filtros, busca, ordenação, skip/take e count ocorrem no Prisma, dentro de transação de leitura RepeatableRead. Não há carregamento de todas as páginas ou filtragem em memória.

O endpoint `/fornecedores` aceita paginação, busca/nome/CNPJ, ordem e `tipo=GLOBAL_DISPONIVEL` (default) ou `ESPECIFICO`. Globais disponíveis são ativos sem associação ATIVA para a empresa; uma associação INATIVA aparece para permitir reativação. Específicos são ativos e pertencem à empresa autenticada. As condições retornadas são sempre filtradas pela empresa ativa; nunca são expostas negociações de terceiros. Esta é uma consulta explícita de descoberta para associação, não o seletor operacional de Compras.

## Integridade e integração com Compras

- Fornecedor específico só pode ser utilizado pela própria empresa e se estiver ativo, sem exigir associação.
- Global só pode ser utilizado se o fornecedor e a associação da empresa estiverem ativos.
- A regra de disponibilidade fica em `policy.ts`, reutilizada por `compras.repository.ts`; a associação nunca autoriza um fornecedor específico de outra empresa.
- O seletor paginado de Compras retorna somente fornecedores elegíveis e, para globais, `tipoFornecedor` e `condicoesComerciais` exclusivos da empresa.
- Cadastro/edição de pedido, emissão de pedido e criação de compra verificam o fornecedor no servidor. A conversão de pedido antigo também revalida, impedindo novas compras após inativação do vínculo.
- O recebimento de compras já emitidas mantém o fluxo existente: inativar uma associação não invalida nem reescreve compras históricas.
- Os diálogos de novas compras/pedidos mostram os prazos e observações como informação auxiliar. O schema atual desses documentos não possui campos próprios para guardar essas condições; não são inventadas colunas nem copiados valores para documentos antigos. Não há geração de parcelas, pagamentos ou contas a pagar por este módulo.

Escritas usam `withCompanyWriteLock`, já existente. O lock da linha da empresa também é utilizado pelas gravações de Compras, serializando inativação e novas compras concorrentes. A elegibilidade do fornecedor global é relida sob FOR UPDATE, impedindo mudança de proprietário/status no meio da associação. A restrição existente `(id_empresa, id_fornecedor)` garante unicidade; P2002 e conflitos concorrentes viram 409. Não há repetição automática de escritas.

Criação, edição, reativação e inativação efetiva registram auditoria na mesma transação, com o helper de serialização TEXT existente. Falha em qualquer etapa reverte a operação. Condições de empresas diferentes são independentes.

## Interface

Três visões: Globais associados, Específicos da empresa e Globais disponíveis. Pesquisa e paginação são remotas. Há filtro de situação das associações, consulta das condições, associação, edição, inativação com AlertDialog e reativação. Mudança de empresa remonta o conteúdo por ID, fecha diálogos e descarta resultados antigos. Consultas usam AbortSignal e chave de consulta para evitar respostas obsoletas. Formulários mostram erros, bloqueiam envios durante processamento e exibem feedback com toast; edições enviam somente condições modificadas. Null/zero/dias são diferenciados visualmente.

Estados: autenticação/carregamento, seleção de empresa, lista vazia, erro com tentativa novamente, dados disponíveis e sucesso de escrita. Cores utilizam tokens do tema e a tabela permite rolagem horizontal em telas pequenas.

## Arquivos desta entrega

Criados:

```text
src/modules/empresa-fornecedor/{schema,repository,service,router,policy}.ts
src/modules/empresa-fornecedor/README.md
src/app/api/empresa-fornecedor/route.ts
src/app/api/empresa-fornecedor/[id]/route.ts
src/app/api/empresa-fornecedor/fornecedores/route.ts
src/features/empresa-fornecedor/api.ts
src/features/empresa-fornecedor/components/formulario-condicoes.tsx
src/features/empresa-fornecedor/components/tela-empresa-fornecedor.tsx
src/app/(app)/cadastros/empresa-fornecedor/page.tsx
src/app/(app)/cadastros/empresa-fornecedor/loading.tsx
src/features/compras/components/condicoes-fornecedor.tsx
tests/unit/empresa-fornecedor/{schema,routes,compras,interface}.test.ts
```

Modificados:

```text
modules/catalogos/repository.ts                  # recurso FORNECEDORES no tipo existente
src/modules/compras/compras.repository.ts        # política de elegibilidade compartilhada
src/modules/compras/compras.service.ts           # revalidação e condições no seletor
src/modules/compras/router.ts                    # assinatura de contexto compatível com a validação de build do Next
src/features/compras/tipos.ts                    # condições auxiliares do seletor
src/features/compras/components/dialogo-compra.tsx
src/features/compras/components/dialogo-pedido.tsx
src/features/fornecedores/components/tela-fornecedores.tsx # acesso à nova tela
src/config/navegacao.ts                          # menu da tela
tests/helpers/prisma.ts                          # mocks compartilhados
README.md                                       # acompanhamento do módulo
```

## Verificação

```sh
npm test -- tests/unit/empresa-fornecedor tests/unit/compras tests/unit/fornecedores
npm test
npm run typecheck
npm run lint
```

Cobertura: cadastro, duplicidade, reativação mantendo ID/campos, null/omissão, PUT completo, DELETE idempotente, fornecedor específico/inativo, isolamento entre empresas, permissões por operação, rate limit, filtros/paginação, disputa de criação e integração com emissão/conversão de Compras. Interface: validação do cliente, chamadas HTTP, paginação remota, renderização de carregamento/vazio/erro. As disputas e o banco são simulados com mocks; não comprovam locks ou rollback em MySQL real. Não foram alterados dados de banco compartilhado.

Limites: rate limiting local ao processo; não há parcelamento financeiro nem snapshots de condições nos documentos de compra. Atribuição da issue #21 depende de acesso ao GitHub: não há gh instalado e a autorização para a janela do navegador expirou. Branch criada a partir de origin/develop: `feature/21-vincular-fornecedores-empresas`.

Ambiente de build: o Turbopack apresentou falha interna ao iniciar o processo de CSS. A compilação alternativa usa `npm run build -- --webpack`; neste ambiente, o Node também precisa de `--use-system-ca` para validar o certificado do download de fontes. Este checkout não possui DATABASE_URL configurada, portanto a validação de build usa somente uma URL fictícia em localhost:1, sem criar `.env` ou se conectar a dados reais. Isso não substitui testes com MySQL e autenticação reais nem validação visual interativa da tela.

Resultado final: 1.225 testes unitários em 66 arquivos passaram; `npm run lint`, `npm run typecheck`, Prettier dos arquivos da entrega e build Webpack (com o ambiente de validação acima) passaram. Não foram executadas migrations ou operações em banco real. Nenhuma captura ou validação visual autenticada é apresentada como realizada.
