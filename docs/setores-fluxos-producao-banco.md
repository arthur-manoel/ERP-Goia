# Contrato de banco — setores e fluxos de produção

O schema Prisma e a migration `prisma/migrations/20261004000000_setores_fluxos_producao/migration.sql` incluem todas as estruturas abaixo. A migration é aditiva: não remove tabelas nem dados existentes. Foi preparada para execução após a baseline e a migration de refresh tokens.

Antes de publicar a API, aplicar a migration no ambiente de destino e executar `npm run db:generate`. Em banco MySQL local administrado pelo Prisma: `npx prisma migrate deploy`. Para banco compartilhado/remoto, a proteção de `prisma.config.ts` permanece ativa: o responsável pelo banco deve aplicar o SQL pelo procedimento de implantação da equipe. Não executar a baseline sobre um banco existente que já contém as tabelas.

As datas dos setores antigos são preenchidas pelo DEFAULT na aplicação da migration; não representam reconstrução de histórico. As consultas SQL parametrizadas continuam no repositório e agora possuem todas as tabelas/colunas correspondentes no schema. `@updatedAt` atende às escritas pelo Prisma; `ON UPDATE CURRENT_TIMESTAMP(3)` também cobre escritas SQL. O CHECK de ordem 1–100 está no SQL da migration, pois Prisma não o expressa no schema.

Manter MySQL/InnoDB, tipos de IDs compatíveis com os `INT` existentes e a collation usada em `setores.nome`. Unicidade de nomes é por empresa, inclusive registros inativos, conforme o padrão atual. Datas retornam ISO 8601 na API. `ativo` é representado por `status = ATIVO/INATIVO`, preservando a convenção do banco.

## 1. Tabela existente `setores`

| Campo novo | Tipo | Restrições |
| --- | --- | --- |
| `data_cadastro` | `DATETIME(3)` | NOT NULL, DEFAULT CURRENT_TIMESTAMP(3) |
| `data_atualizacao` | `DATETIME(3)` | NOT NULL, DEFAULT CURRENT_TIMESTAMP(3), ON UPDATE CURRENT_TIMESTAMP(3) |

Preservar id, id_empresa, nome VARCHAR(100), descricao VARCHAR(255) NULL, tipo com default `Outro`, status e todas as relações existentes. Preservar UNIQUE `(id_empresa, nome)`. A API mapeia as novas datas para `createdAt`/`updatedAt`. Para setores já existentes, o DEFAULT usa a data de aplicação da mudança; não há informação histórica suficiente para reconstruir a criação exata.

## 2. Nova tabela `fluxos_producao`

| Campo | Tipo | Restrições |
| --- | --- | --- |
| `id` | INT | PK, AUTO_INCREMENT |
| `id_empresa` | INT | NOT NULL, FK empresas(id), ON DELETE CASCADE |
| `nome` | VARCHAR(100) | NOT NULL |
| `descricao` | VARCHAR(255) | NULL |
| `status` | ENUM('ATIVO','INATIVO') | NOT NULL, DEFAULT 'ATIVO' |
| `data_cadastro` | DATETIME(3) | NOT NULL, DEFAULT CURRENT_TIMESTAMP(3) |
| `data_atualizacao` | DATETIME(3) | NOT NULL, DEFAULT CURRENT_TIMESTAMP(3), ON UPDATE CURRENT_TIMESTAMP(3) |

UNIQUE `(id_empresa, nome)`; índice `(id_empresa, status)`. O nome deve seguir a mesma comparação/collation dos setores.

## 3. Nova tabela `fluxo_producao_setor`

| Campo | Tipo | Restrições |
| --- | --- | --- |
| `id_fluxo` | INT | NOT NULL, FK fluxos_producao(id), ON DELETE CASCADE |
| `id_setor` | INT | NOT NULL, FK setores(id), ON DELETE RESTRICT |
| `ordem` | INT | NOT NULL, CHECK ordem BETWEEN 1 AND 100 |

PK `(id_fluxo, id_setor)`; UNIQUE `(id_fluxo, ordem)`; índice `(id_setor)`. A API grava posições consecutivas começando em 1, exige 1–100 setores distintos e valida que todos pertencem à empresa do fluxo. Essas validações devem ser respeitadas também por outros escritores do banco.

## 4. Nova tabela `produto_fluxo`

| Campo | Tipo | Restrições |
| --- | --- | --- |
| `id_empresa` | INT | NOT NULL |
| `id_produto` | INT | NOT NULL |
| `id_fluxo` | INT | NOT NULL, FK fluxos_producao(id), ON DELETE CASCADE |

PK `(id_empresa, id_produto)`; FK composta `(id_empresa, id_produto)` → `produto_empresa(id_empresa, id_produto)`, ON DELETE CASCADE; índice `(id_fluxo)`.

A ausência de linha representa produto sem fluxo. A associação é por produto/empresa, porque `produtos` é compartilhada e os setores são locais à empresa. A API verifica a empresa do fluxo antes de associar. Excluir um fluxo permitido remove suas associações: novas OPs desses produtos passam a receber 422 até nova associação.

## 5. Nova tabela `ordem_producao_snapshot`

| Campo | Tipo | Restrições |
| --- | --- | --- |
| `id_ordem_producao` | INT | PK, FK ordem_producao(id), ON DELETE CASCADE |
| `id_fluxo` | INT | NULL, FK fluxos_producao(id), ON DELETE SET NULL |
| `snapshot` | JSON | NOT NULL |

Índice `(id_fluxo)`, necessário para verificar ordens em andamento ao excluir o fluxo. A API considera em andamento todos os status exceto `CONCLUIDA` e `CANCELADA`, incluindo `PLANEJADA` e `PAUSADA`.

Conteúdo do JSON, independente de futuras alterações/exclusão do fluxo:

```json
{
  "fluxoId": 3,
  "nome": "Confecção",
  "descricao": "Fluxo padrão",
  "setores": [
    { "id": 7, "nome": "Corte", "descricao": null, "ordem": 1 },
    { "id": 8, "nome": "Costura", "descricao": null, "ordem": 2 }
  ]
}
```

O código só insere esse snapshot, nunca o atualiza. `id_fluxo` pode virar NULL após exclusão permitida; `snapshot.fluxoId` permanece como referência histórica. Não criar snapshots artificiais para ordens antigas: a ausência da linha seleciona o comportamento legado de avanço/encerramento.

## 6. Tabela existente `ordem_producao_fluxo_setor`

| Campo novo | Tipo | Restrições |
| --- | --- | --- |
| `status` | ENUM('PENDENTE','EM_PRODUCAO','CONCLUIDA') | NOT NULL, DEFAULT 'PENDENTE' |
| `data_inicio` | DATETIME(3) | NULL |
| `data_conclusao` | DATETIME(3) | NULL |

Preservar PK `id`, campos existentes, UNIQUE `(id_ordem_producao, ordem)`, UNIQUE `(id_ordem_producao, id_setor)` e FKs existentes. Manter FK de setor restritiva para preservar as referências históricas; excluir setor ainda referenciado por OP ou outro módulo retorna 409.

O DEFAULT PENDENTE existe tanto no schema quanto na migration; novas etapas são criadas nesse estado. Ordens antigas podem ter essas colunas preenchidas pelo default, mas não usam a nova máquina de etapas enquanto não houver snapshot.

## Aplicação e verificação

1. Aplicar a migration entregue antes de publicar o back-end e regenerar o Prisma Client. Não existe fallback silencioso para tabelas/colunas ausentes.
2. Não é necessário acrescentar recursos ao enum de permissões: os cadastros usam `ORDENS_PRODUCAO`; associação usa `PRODUTOS`.
3. Preparar um banco local descartável aplicando todas as migrations com `npx prisma migrate deploy`, sem utilizar produção para testes.
4. Executar `PRODUCAO_TEST_DATABASE_URL='mysql://...' node tests/producao.integration.test.mjs`. Acrescentar `--http` para testar URLs no servidor Next real. O teste cria e remove somente fixtures, sem DDL.
5. A integração cobre unicidade, FKs, concorrência, CRUD, auditoria/rollback, GET da associação e o ciclo da OP. Os testes com mocks também cobrem os formatos de erro do adapter MariaDB do Prisma 7.10.
