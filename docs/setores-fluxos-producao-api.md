# API de setores, fluxos e etapas de produção

## Arquitetura e decisões

Rotas Next.js em `src/app/api` delegam a routers em `src/modules`; Zod valida entradas estritas; serviços aplicam regras; repositórios acessam Prisma/MySQL. O guia local de Route Handlers foi consultado; parâmetros dinâmicos são `Promise`. Nomes públicos novos usam camelCase; os objetos legados de OP conservam snake_case e os campos existentes de resposta. Transações usam isolamento `Serializable`, com conflitos retornando 409 sem repetição automática.

O produto pertence ao catálogo `produtos` e fica disponível por `produto_empresa`. A OP existente exige produto ativo habilitado para produção, ficha técnica ativa/vigente e componentes vinculados; calcula insumos sem aplicar perdas nem movimentar estoque. Essas regras permanecem. Setores já existiam, assim como a sequência e movimentações de setores por OP; foram acrescentados fluxo reutilizável e estado por etapa.

Decisões:

- Nomes únicos por empresa, inclusive inativos. IDs são inteiros positivos de até 2147483647.
- Um fluxo tem de 1 a 100 setores ativos e distintos; a posição no array determina `ordem`, a partir de 1. PATCH sem `setores` mantém os vínculos; com `setores` substitui toda a sequência atomicamente.
- Produto pode ter um fluxo por empresa. PUT substitui a associação; DELETE a remove.
- Criação da OP usa o fluxo atual do produto e grava uma cópia de nomes, descrições e sequência. Mudanças e inativações posteriores não alteram o snapshot nem impedem executar suas etapas.
- A OP continua sendo criada como `PLANEJADA`; deve ser liberada antes de iniciar a primeira etapa. A etapa inicia `PENDENTE`, passa a `EM_PRODUCAO` e depois a `CONCLUIDA`.
- Concluir a última etapa conclui a OP e confirma a quantidade produzida planejada, sem baixar estoque.
- OP com snapshot não admite troca de produto. Quantidade ainda pode mudar em PLANEJADA e recalcula insumos, sem alterar o snapshot.
- `/avancar` preserva liberação, pausa e retomada; não inicia nem pula etapas de OPs com snapshot. `/encerrar` não pode concluir essas OPs. OPs antigas, sem snapshot, continuam usando o ciclo anterior.
- DELETE de setor em fluxo retorna 409; PATCH com `ativo: false` permite inativar. Outras referências de banco também podem impedir exclusão. Fluxo com OP não concluída/não cancelada retorna 409 ao excluir. Exclusão permitida remove associações dos produtos e mantém o JSON histórico das OPs.

## Autenticação e autorização

Estas rotas exigem `Authorization: Bearer <accessToken>`. Cookies de sessão/refresh não autenticam essas requisições. Obtenha o accessToken no login e use os headers:

```http
Authorization: Bearer <token>
X-Empresa-Id: 10
Content-Type: application/json
```

O header seleciona um vínculo ativo; nunca concede acesso. Pode ser omitido quando existe apenas um vínculo ativo. Perfis aceitos: ADMINISTRACAO/PRODUCAO, conforme autorização de produção. Administradores também precisam de vínculo ativo.

Setores e fluxos usam permissões `ORDENS_PRODUCAO`: `pode_ler`, `pode_criar`, `pode_editar`, `pode_excluir`, conforme método. Inativação também exige `pode_excluir`. Associação/desassociação requer `PRODUTOS.pode_editar`; GET da associação requer `PRODUTOS.pode_ler`. Consulta de OP usa `ORDENS_PRODUCAO.pode_ler`; ações usam `pode_editar`.

Todas as respostas dos novos endpoints têm `Cache-Control: no-store`. GET e DELETE não recebem corpo; 204 não tem JSON. Erros usam `{"error":"mensagem"}`.

## Setores

### POST `/api/setores` → 201

```json
{ "nome": "Corte", "descricao": "Preparação das peças", "ativo": true }
```

```json
{
  "setor": {
    "id": 7,
    "nome": "Corte",
    "descricao": "Preparação das peças",
    "ativo": true,
    "createdAt": "2026-09-28T12:00:00.000Z",
    "updatedAt": "2026-09-28T12:00:00.000Z"
  }
}
```

`nome` obrigatório, até 100 caracteres; `descricao` opcional/nula, até 255; `ativo` opcional, default true.

### GET `/api/setores?pagina=1&limite=20&nome=Cort&status=ATIVO` → 200

Sem corpo. Nome filtra por trecho; status aceita ATIVO/INATIVO; limite máximo 100, defaults pagina=1/limite=20. Parâmetros desconhecidos/repetidos são rejeitados. Ordenação estável por nome e id.

```json
{
  "setores": [
    { "id": 7, "nome": "Corte", "descricao": "Preparação das peças", "ativo": true, "createdAt": "2026-09-28T12:00:00.000Z", "updatedAt": "2026-09-28T12:00:00.000Z" }
  ],
  "paginacao": { "pagina": 1, "limite": 20, "total": 1, "totalPaginas": 1 }
}
```

### GET `/api/setores/7` → 200

Sem corpo. Resposta no mesmo formato `{ "setor": ... }` do POST.

### PATCH `/api/setores/7` → 200

```json
{ "descricao": null, "ativo": false }
```

```json
{
  "setor": {
    "id": 7, "nome": "Corte", "descricao": null, "ativo": false,
    "createdAt": "2026-09-28T12:00:00.000Z", "updatedAt": "2026-09-28T13:00:00.000Z"
  }
}
```

### DELETE `/api/setores/7` → 204

Sem corpo de requisição ou resposta. Quando vinculado a fluxo → 409:

```json
{ "error": "O setor está vinculado a um fluxo. Inative-o ou remova o vínculo." }
```

## Fluxos

Os exemplos abaixo assumem os setores 7 e 8 ativos.

### POST `/api/fluxos-producao` → 201

```json
{ "nome": "Confecção", "descricao": "Fluxo padrão", "ativo": true, "setores": [7, 8] }
```

```json
{
  "fluxo": {
    "id": 3, "nome": "Confecção", "descricao": "Fluxo padrão", "ativo": true,
    "createdAt": "2026-09-28T12:00:00.000Z", "updatedAt": "2026-09-28T12:00:00.000Z",
    "setores": [
      { "id": 7, "nome": "Corte", "descricao": null, "ativo": true, "createdAt": "2026-09-28T12:00:00.000Z", "updatedAt": "2026-09-28T12:00:00.000Z", "ordem": 1 },
      { "id": 8, "nome": "Costura", "descricao": null, "ativo": true, "createdAt": "2026-09-28T12:00:00.000Z", "updatedAt": "2026-09-28T12:00:00.000Z", "ordem": 2 }
    ]
  }
}
```

### GET `/api/fluxos-producao/3` → 200

Sem corpo. Retorna o mesmo formato completo `{ "fluxo": ... }` do POST, incluindo setores ordenados.

### GET `/api/fluxos-producao?pagina=1&limite=20&nome=Conf&status=ATIVO` → 200

Sem corpo. Mesmos filtros/paginação de setores. Cada fluxo inclui seus setores ordenados. Exemplo com fluxo de um setor:

```json
{
  "fluxos": [
    {
      "id": 4, "nome": "Conferência", "descricao": null, "ativo": true,
      "createdAt": "2026-09-28T12:00:00.000Z", "updatedAt": "2026-09-28T12:00:00.000Z",
      "setores": [
        { "id": 7, "nome": "Corte", "descricao": null, "ativo": true, "createdAt": "2026-09-28T12:00:00.000Z", "updatedAt": "2026-09-28T12:00:00.000Z", "ordem": 1 }
      ]
    }
  ],
  "paginacao": { "pagina": 1, "limite": 20, "total": 1, "totalPaginas": 1 }
}
```

### PATCH `/api/fluxos-producao/3` → 200

```json
{ "nome": "Confecção revisada", "setores": [8, 7] }
```

```json
{
  "fluxo": {
    "id": 3, "nome": "Confecção revisada", "descricao": "Fluxo padrão", "ativo": true,
    "createdAt": "2026-09-28T12:00:00.000Z", "updatedAt": "2026-09-28T13:00:00.000Z",
    "setores": [
      { "id": 8, "nome": "Costura", "descricao": null, "ativo": true, "createdAt": "2026-09-28T12:00:00.000Z", "updatedAt": "2026-09-28T12:00:00.000Z", "ordem": 1 },
      { "id": 7, "nome": "Corte", "descricao": null, "ativo": true, "createdAt": "2026-09-28T12:00:00.000Z", "updatedAt": "2026-09-28T12:00:00.000Z", "ordem": 2 }
    ]
  }
}
```

### DELETE `/api/fluxos-producao/3` → 204

Sem corpo de requisição ou resposta. Se houver OP em andamento → 409:

```json
{ "error": "O fluxo está em uso por ordens em andamento." }
```

## Associação com produto

### GET `/api/produtos/30/fluxo` → 200

Sem corpo. Retorna o fluxo atual do produto, com setores ordenados e datas, inclusive quando inativo. Usa a empresa selecionada e `PRODUTOS.pode_ler`. Não altera associação nem cria auditoria de escrita.

Sem associação:

```json
{ "produto": { "id": 30, "fluxoId": null }, "fluxo": null }
```

Com associação (exemplo de um setor):

```json
{
  "produto": { "id": 30, "fluxoId": 3 },
  "fluxo": {
    "id": 3, "nome": "Corte", "descricao": null, "ativo": true,
    "createdAt": "2026-10-04T12:00:00.000Z", "updatedAt": "2026-10-04T12:00:00.000Z",
    "setores": [
      { "id": 7, "nome": "Corte", "descricao": null, "ativo": true, "createdAt": "2026-10-04T12:00:00.000Z", "updatedAt": "2026-10-04T12:00:00.000Z", "ordem": 1 }
    ]
  }
}
```

Produto inexistente ou não vinculado à empresa selecionada retorna 404. Empresa sem acesso retorna 403. A ausência de fluxo retorna 200/null na consulta; apenas a tentativa de criar OP sem fluxo retorna 422.

### PUT `/api/produtos/30/fluxo` → 200

```json
{ "fluxoId": 3 }
```

```json
{ "produto": { "id": 30, "fluxoId": 3 } }
```

Produto/fluxo devem pertencer à empresa selecionada. Fluxo inativo, vazio ou com setor inativo retorna 422. Produto ou fluxo inexistente/inacessível retorna 404.

### DELETE `/api/produtos/30/fluxo` → 204

Sem corpo de requisição ou resposta. Remoção idempotente para produto existente, mesmo se já estiver sem fluxo. Não afeta snapshots de OPs existentes.

## Ordens e etapas

As respostas preservam o envelope anterior (`ordem`, `perdaAplicada`, `baixaEstoque`, `disponibilidadeEstoque`) e acrescentam `fluxoSnapshot` e `etapas` nas ordens novas. Os exemplos desta seção **mostram recortes** de `ordem`; a resposta real mantém todos os campos, itens, insumos previstos e movimentações existentes.

### POST `/api/ordens-producao` → 201

```json
{ "idProduto": 30, "quantidade": "10.000", "tamanho": "M", "observacao": "Lote piloto", "prioridade": "NORMAL" }
```

Não enviar `setores`: agora a sequência vem do fluxo associado. O exemplo assume o fluxo original [7, 8].

```json
{
  "ordem": { "id": 50, "numero": "50", "status": "PLANEJADA", "id_setor": null, "quantidade_planejada": "10" },
  "perdaAplicada": false,
  "baixaEstoque": "pendente",
  "disponibilidadeEstoque": "nao_verificada",
  "fluxoSnapshot": {
    "fluxoId": 3, "nome": "Confecção", "descricao": "Fluxo padrão",
    "setores": [
      { "id": 7, "nome": "Corte", "descricao": null, "ordem": 1 },
      { "id": 8, "nome": "Costura", "descricao": null, "ordem": 2 }
    ]
  },
  "etapas": [
    { "id": 101, "id_setor": 7, "ordem": 1, "status": "PENDENTE", "data_inicio": null, "data_conclusao": null },
    { "id": 102, "id_setor": 8, "ordem": 2, "status": "PENDENTE", "data_inicio": null, "data_conclusao": null }
  ]
}
```

Sem fluxo → 422:

```json
{ "error": "O produto não possui fluxo de produção associado." }
```

### GET `/api/ordens-producao/50` → 200

Sem corpo. Retorna o mesmo envelope do POST, com status/datas atuais e o snapshot original. Usar `etapas[].id` para as ações. Ordens antigas não retornam `fluxoSnapshot`/`etapas`.

### PATCH `/api/ordens-producao/50` → 200

Endpoint existente, com proteção adicional contra troca de produto em OP com snapshot:

```json
{ "statusEsperado": "PLANEJADA", "quantidade": "12.000" }
```

Retorna o envelope completo do POST, com `ordem.quantidade_planejada` igual a `"12"`, insumos recalculados e snapshot/etapas preservados. Troca para outro `idProduto` retorna 409.

### POST `/api/ordens-producao/50/avancar` → 200

Liberação necessária antes da primeira etapa:

```json
{ "statusEsperado": "PLANEJADA", "setorEsperado": null, "statusDestino": "LIBERADA" }
```

Retorna o envelope completo da OP, com `ordem.status = "LIBERADA"` e etapas pendentes. Pausa usa `EM_PRODUCAO → PAUSADA`; retomada usa `PAUSADA → EM_PRODUCAO`, sempre informando status/setor esperados. Tentar iniciar/pular setor por este endpoint em ordem nova retorna 409:

```json
{ "error": "Use o endpoint de iniciar etapa para esta ordem." }
```

### POST `/api/ordens-producao/50/etapas/iniciar` → 200

```json
{ "etapaId": 101 }
```

Retorna envelope completo da OP. Recorte dos campos alterados:

```json
{
  "ordem": { "id": 50, "status": "EM_PRODUCAO", "id_setor": 7, "data_inicio": "2026-09-28T14:00:00.000Z" },
  "etapas": [
    { "id": 101, "id_setor": 7, "ordem": 1, "status": "EM_PRODUCAO", "data_inicio": "2026-09-28T14:00:00.000Z", "data_conclusao": null },
    { "id": 102, "id_setor": 8, "ordem": 2, "status": "PENDENTE", "data_inicio": null, "data_conclusao": null }
  ]
}
```

Não admite etapa futura, já iniciada, concluída ou de outra OP. Estado incompatível, inclusive ordem pausada, retorna 409. O cliente deve consultar novamente após conflito; não há avanço automático da etapa seguinte.

### POST `/api/ordens-producao/50/etapas/concluir` → 200

```json
{ "etapaId": 101 }
```

Retorna envelope completo; etapa 101 fica CONCLUIDA, etapa 102 permanece PENDENTE e a ordem permanece EM_PRODUCAO no setor 7 até iniciar a etapa 102. Exemplo de recorte:

```json
{
  "ordem": { "id": 50, "status": "EM_PRODUCAO", "id_setor": 7 },
  "etapas": [
    { "id": 101, "id_setor": 7, "ordem": 1, "status": "CONCLUIDA", "data_inicio": "2026-09-28T14:00:00.000Z", "data_conclusao": "2026-09-28T15:00:00.000Z" },
    { "id": 102, "id_setor": 8, "ordem": 2, "status": "PENDENTE", "data_inicio": null, "data_conclusao": null }
  ]
}
```

Depois de iniciar 102, concluir com `{"etapaId":102}` retorna a OP CONCLUIDA, `data_conclusao` preenchida e ambas as etapas CONCLUIDA. Pedidos repetidos retornam 409 sem concluir outra etapa. A transação inclui etapa, OP, quantidade produzida e auditoria.

### POST `/api/ordens-producao/50/encerrar` → 409 para OP com snapshot

```json
{ "statusEsperado": "EM_PRODUCAO", "setorEsperado": 8 }
```

```json
{ "error": "Conclua a última etapa para encerrar esta ordem." }
```

O endpoint continua funcionando como antes em ordens sem snapshot.

## Erros

| HTTP | Situação |
| --- | --- |
| 400 | JSON inválido, campo desconhecido, ID/paginação inválidos, setores vazios/repetidos, regras de ficha/quantidade já existentes |
| 401 / 403 | Autenticação ausente/inválida, empresa ou permissão negada |
| 404 | Recurso inexistente ou de outra empresa |
| 409 | Nome duplicado, exclusão com vínculos, estado/etapa incompatível, disputa concorrente, troca de produto com snapshot |
| 422 | Produto sem fluxo; fluxo inativo/vazio ou setor inativo |
| 500 | Falha interna, incluindo infraestrutura/banco sem as estruturas obrigatórias; detalhes só no log |

## Auditoria e conflitos

Criação, edição, inativação e exclusão de setores/fluxos registram `INSERT`, `UPDATE` ou `DELETE` em `auditoria`, com empresa, usuário autenticado e dados anteriores/novos. Fluxos incluem a sequência dos setores no registro. Associação, substituição e desassociação registram a tabela `produto_fluxo`; `id_registro` identifica `produto_empresa.id`, e o JSON contém `idEmpresa`, `idProduto` e `fluxoId`. Repetir uma associação idêntica ou remover uma associação já ausente não gera alteração nem nova auditoria.

Excluir um fluxo também audita as associações removidas por cascade. Todas as escritas e auditorias pertencem à mesma transação: falha na auditoria desfaz a operação inteira.

Conflitos reconhecem `PrismaClientKnownRequestError` e `DriverAdapterError` do adapter instalado, diretamente ou em `meta.driverAdapterError`. Unicidade, FK e disputa concorrente retornam 409. Erros de tabela/coluna ausente ou conexão permanecem falhas internas, sem serem disfarçados de conflito.

## Validação e arquivos

Executar testes sem banco: `node --test tests/*.test.mjs`. Integração real fica condicionada a `PRODUCAO_TEST_DATABASE_URL`, com banco local previamente preparado conforme [contrato de banco](setores-fluxos-producao-banco.md). Acrescentar `--http` ao executar diretamente `tests/producao.integration.test.mjs` para testar o Next real. Nenhum teste aplica DDL.

Arquivos criados:

- `src/modules/fluxos/fluxos.schema.ts`
- `src/modules/fluxos/fluxos.repository.ts`
- `src/modules/fluxos/fluxos.service.ts`
- `src/modules/fluxos/router.ts`
- `src/app/api/setores/route.ts`
- `src/app/api/setores/[id]/route.ts`
- `src/app/api/fluxos-producao/route.ts`
- `src/app/api/fluxos-producao/[id]/route.ts`
- `src/app/api/produtos/[id]/fluxo/route.ts`
- `src/app/api/ordens-producao/[id]/etapas/iniciar/route.ts`
- `src/app/api/ordens-producao/[id]/etapas/concluir/route.ts`
- `docs/setores-fluxos-producao-api.md`
- `docs/setores-fluxos-producao-banco.md`

Arquivos alterados:

- `src/modules/producao/producao.authorization.ts`
- `src/modules/producao/producao.repository.ts`
- `src/modules/producao/producao.schema.ts`
- `src/modules/producao/producao.service.ts`
- `src/modules/producao/router.ts`
- `src/app/api/ordens-producao/[id]/route.ts`
- `tests/producao.test.mjs`
- `tests/producao.integration.test.mjs`
- `tests/producao.http.mjs`

O front-end e os seeds permanecem inalterados. O cadastro de usuários foi removido deste trabalho. O schema e a migration de setores/fluxos fazem parte da entrega; o Prisma Client gerado continua ignorado pelo Git e deve ser regenerado na implantação.


Correções do PR: `prisma/schema.prisma`, `prisma/migrations/20261004000000_setores_fluxos_producao/migration.sql`, `src/modules/producao/producao.errors.ts` e `tests/fluxos.integration-cases.mjs`, além dos arquivos de serviço/repositório/router e testes listados acima.
