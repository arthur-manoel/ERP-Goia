# Perdas por etapa — issue #38

Base: `develop`. Escopo exclusivo de banco; a tela e a API não são alteradas.

## Decisão de estrutura

`ordem_producao_apontamento` guarda eventos por item (incluindo sua variação) e etapa da ordem. Uma etapa pode receber vários apontamentos, inclusive no mesmo dia e com motivos diferentes. A etapa é o setor do fluxo congelado da ordem, não texto livre nem uma movimentação entre setores.

As chaves compostas garantem que item e etapa pertencem à mesma ordem. A empresa é obtida pela ordem; não há um segundo identificador de empresa que possa divergir. `id_usuario` identifica o responsável; autorização por empresa continua sendo responsabilidade da aplicação.

Quantidades usam `DECIMAL(15,3)`, como os itens da produção. Permite produção sem perda (motivo NULL) e perda integral (produção zero). Exige alguma quantidade positiva e motivo não vazio quando há perda. Não exige um motivo de catálogo: o texto preserva a justificativa do evento.

Registros existentes permanecem intactos. Não se converte movimentação em produção ou perda, nem se atualiza automaticamente `ordem_producao_item.quantidade_produzida`: somar etapas nesse acumulador duplicaria a produção. Sem triggers ou procedures. Exclusões de item, etapa ou responsável com apontamentos são bloqueadas para preservar o histórico.

## Aplicação DB-first

SQL canônico: `../migrations/20261023000000_apontamentos_perdas_producao/migration.sql`.

1. No banco compartilhado, seguir a decisão/aprovação e aplicação pelo responsável descritas no README. O PR não executa DDL no compartilhado.
2. Conferir que a tabela nova e o índice `uk_op_item_ordem_id` ainda não existem. O SQL é de execução única; não repetir após aplicação parcial. DDL MySQL faz commit implícito.
3. Aplicar o SQL, preservando os dados existentes, e executar `npm run db:pull`. Revisar somente a nova tabela, suas relações e o índice composto; divergências locais de outras funcionalidades não pertencem a esta alteração.
4. Executar `npm run db:validate`.

Os CHECKs não são representados integralmente pelo Prisma; preservar o SQL como contrato. A integração da tela para gravar eventos exige trabalho posterior fora do escopo exclusivo de banco.

## Validação local

Com `PERDAS_TEST_DATABASE_URL` definido para um MySQL local já preparado, executar:

```bash
node prisma/tests/perdas-producao.mjs
```

O teste cria fixtures em uma transação e faz rollback ao terminar. Verifica produção sem perda, perda integral, motivos obrigatórios, valores negativos/zerados, precisão decimal, vínculo de item/etapa à ordem, usuário existente, proteção do histórico e totais separados por etapa. Não executa DDL nem altera o acumulador de produção dos itens.

## Consulta por etapa

Filtrar a empresa através da ordem antes de agregar. A taxa usa produção mais perda da mesma etapa; não somar a produção de várias etapas como quantidade final da ordem.

```sql
SELECT a.id_ordem_producao, a.id_setor,
       SUM(a.quantidade_produzida) AS produzido,
       SUM(a.quantidade_perdida) AS perdido,
       100 * SUM(a.quantidade_perdida)
           / NULLIF(SUM(a.quantidade_produzida + a.quantidade_perdida), 0) AS taxa_perda
FROM ordem_producao_apontamento a
JOIN ordem_producao op ON op.id = a.id_ordem_producao
WHERE op.id_empresa = ?
GROUP BY a.id_ordem_producao, a.id_setor;
```
