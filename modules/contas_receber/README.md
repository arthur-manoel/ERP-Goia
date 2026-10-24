# Contas a receber

Organização: schemas Zod, repository Prisma, service de negócio e handlers App
Router. `modules/contas_receber/http.ts` reutiliza `catalogRequest`; este passa por
`handleRequest`, que padroniza respostas e erros usando `NextResponse.json()`.

## Endpoints e autorização

- `GET/POST /api/contas_receber`.
- `GET/PUT/PATCH/DELETE /api/contas_receber/:id`.
- JWT obrigatório; papéis `ADMINISTRACAO` ou `FINANCEIRO`, vínculo ativo com empresa
  ativa e permissão `FINANCEIRO` específica (`pode_ler`, `pode_criar`, `pode_editar`,
  `pode_excluir`). As exceções de ADMIN global e nível EMPRESA seguem o autorizador
  de catálogos existente; ambas continuam exigindo vínculo ativo.
- `X-Empresa-Id`, se enviado, restringe a operação a essa empresa. Corpo e filtros
  de outra empresa recebem 403. Sem header, somente empresas autorizadas para a
  ação participam da operação. IDs fora desse escopo retornam 404.
- Rate limit local por usuário autenticado: 120 leituras/minuto e 30 escritas/minuto.
  Coleção e ID compartilham contadores. A chave usa o ID do JWT já validado, sem
  depender do token bruto ou de `X-Forwarded-For`. Tokens inválidos não alocam
  contadores. Para limite global entre instâncias é necessário storage externo.

## Contrato

Criação: `id_empresa`, `id_venda`, `id_categoria`, `data_vencimento` e
`valor_original` obrigatórios. Parcelas padrão 1, desconto/acréscimo padrão zero,
situação ABERTO. Datas de lançamento/cadastro ficam com o banco; atualização é
definida pelo servidor. `id`, `id_fechamento`, `saldo`, `valor_final` e datas de
auditoria não são aceitos como entrada.

Dinheiro aceita número JSON ou string decimal com ponto, até duas casas decimais,
sem negativos e dentro de DECIMAL(15,2). O cálculo usa Prisma.Decimal e segue
**a fórmula desta solicitação**, que subtrai também o campo `valor_acrescimo`:

```text
valor_final = valor_original - valor_desconto - valor_acrescimo
```

Exemplo (valor final e saldo inicial de 93.00):

```json
{
  "id_empresa": 10,
  "id_venda": 20,
  "id_categoria": 30,
  "data_vencimento": "2026-11-10",
  "valor_original": "100.00",
  "valor_desconto": "5.00",
  "valor_acrescimo": "2.00"
}
```

PUT exige os mesmos campos obrigatórios da criação e restaura opcionais omitidos
aos padrões. PATCH aceita um objeto parcial não vazio e mescla campos no estado
atual bloqueado. Parcelas e valor final são validados novamente após essa mesclagem.
Venda e categoria devem pertencer à mesma empresa; categoria deve estar ativa e
permitir RECEITA ou AMBOS. DELETE cancela logicamente; nenhum registro é apagado.

## Pedidos fechados e recebimentos

Títulos com `id_fechamento` não podem ter valores, vencimentos, parcelas, empresa,
venda, categoria ou situação alterados; somente descrição/observação. PUT com
valores incompatíveis também retorna 409. Metadados desses títulos preservam
valores do plano, reconciliando somente o saldo com pagamentos confirmados.
DELETE não cancela esses títulos. Valores equivalentes em PUT não alteram o plano.

Vendas com fechamento próprio, de seu pedido, ou pedido CONCLUIDO não aceitam
títulos manuais adicionais. Títulos manuais legados ligados a essas vendas também
não podem ser transferidos, cancelados ou ter seu plano alterado por esta API.

**Não há endpoint de pagamento/baixa neste módulo.** POST/PUT/PATCH não podem
transformar uma conta em PAGO ou PARCIAL; retornam 409. Uma futura baixa deve
registrar pagamento, recalcular saldo e situação e criar movimentação financeira
na mesma transação. Até esse fluxo existir, também ficam bloqueadas as transições
VENCIDO/PARCIAL para PAGO. Nenhuma despesa ou pagamento é criado implicitamente.
Títulos pagos, parciais, cancelados ou com pagamentos permitem apenas metadados;
cancelar uma conta paga/parcial/com pagamentos também é bloqueado.
O saldo inicial é o valor final. Toda escrita reconcilia o saldo como valor final
menos a soma dos pagamentos CONFIRMADO. Conferem-se empresa, valores positivos e
movimentos ENTRADA/RECEBIMENTO correspondentes de cada pagamento; divergência ou
recebimento acima do devido retorna 409. Saldos legados nulos/divergentes são
corrigidos quando há evidência consistente. Havendo pagamentos já confirmados e
movimentados, a reconciliação deriva PARCIAL/PAGO e audita BAIXA, sem criar um novo
pagamento ou aceitar uma baixa declarada pelo cliente. Contas pagas inconsistentes
não são reabertas automaticamente.

Criação, edição, cancelamento e reconciliação usam o helper financeiro de auditoria
na mesma transação, com autor do JWT e snapshots antes/depois. Falha no log aborta
a escrita. Títulos gerados pelo fechamento do pedido também são auditados.

## Consultas

Listagem sempre paginada, defaults `page=1`, `limit=20`, máximo 100. Filtros:
`id_empresa`, `id_venda`, `id_categoria`, `situacao`, `descricao`, `busca`,
`data_vencimento` ou `data_vencimento_inicio/fim`, `data_lancamento_inicio/fim`.
Datas civis usam AAAA-MM-DD (UTC); o último dia de lançamento inclui o dia inteiro.
Ordenação: `ordenar_por=id|descricao|data_vencimento|data_lancamento|data_cadastro|valor_final`,
`ordem=asc|desc`. A API usa VENCIDO e traduz para ATRASADO no enum Prisma legado.
Os filtros, ordenação, paginação e contagem ocorrem no banco, em snapshot comum.

```json
{ "success": true, "data": { "rows": [], "count": 0, "page": 1, "limit": 20, "totalPages": 0 } }
```

Erros: 400 validação/relacionamento; 401 JWT inválido; 403 empresa/permissão;
404 conta fora do escopo ou inexistente; 409 baixa sem fluxo, plano protegido,
unicidade ou concorrência; 429 limite; 500 mensagem genérica com log interno.

## Transações e validação

Criação/edição/cancelamento bloqueiam empresas autorizadas em ordem crescente,
seguindo a ordem do módulo de fechamento de pedidos. Atualizações bloqueiam
também a linha da conta com FOR UPDATE **antes** de ler seus valores, saldo e
pagamentos. A validação e escrita usam o mesmo TransactionClient. Isso evita
perda de valores em PATCH simultâneos, inclusive no mesmo segundo, sem depender
da precisão de `data_atualizacao`. Conflitos de persistência retornam 409.
Futuros fluxos de recebimento devem respeitar a mesma ordem de locks.

O modelo já existe no Prisma atual, incluindo saldo/id_fechamento; não foi criada
migration e nenhuma alteração no banco foi executada. Testes em
`tests/unit/contas_receber` usam Prisma mockado, incluindo sequências concorrentes
controladas; não substituem testes de bloqueio no MySQL real.
