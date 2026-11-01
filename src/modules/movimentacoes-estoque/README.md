# API de movimentação e saldo de estoque

Rotas finas em `src/app/api/estoque`; autorização, validação, regras e persistência
em `src/modules/movimentacoes-estoque`. A extensão operacional usa as migrations DB-first de [reservas/grade/recebimentos](../../../docs/operacoes-integradas.md); não há atualização paralela de saldos nos documentos.

| Método | Rota | Permissão ESTOQUE |
| --- | --- | --- |
| POST | `/api/estoque/entradas` | `pode_criar` e `pode_ler` |
| POST | `/api/estoque/saidas` | `pode_criar` e `pode_ler` |
| POST | `/api/estoque/ajustes` | `pode_editar` e `pode_ler` |
| GET | `/api/estoque/saldo?idProduto=1&idLocalEstoque=2` | `pode_ler` |

Todas exigem `Authorization: Bearer <JWT>`. `X-Empresa-Id` seleciona um vínculo
ativo; é obrigatório se houver múltiplas empresas ativas. Usuário, empresa,
vínculo e permissão são consultados no banco. ADMIN e nível EMPRESA dispensam
a permissão específica, mas nunca o vínculo ativo. Os quatro perfis existentes
são aceitos, respeitando essas permissões. Campos de empresa, usuário, origem,
data e tipo de movimento não podem ser enviados no corpo.

As escritas também exigem leitura porque retornam `saldoAnterior` e `saldoAtual`.
Permissão de criar ou editar, isoladamente, não permite consultar essas quantidades.
POSTs exigem `Content-Type: application/json` e leem no máximo 64 KiB, mesmo sem
`Content-Length`. Mensagens de validação são apresentadas em português.

## Entrada e saída

```json
{
  "idProduto": 1,
  "idLocalEstoque": 2,
  "idSetor": 3,
  "quantidade": "10.125",
  "observacao": "Recebimento manual de tecido"
}
```

Quantidade positiva, até três casas decimais e 12 dígitos inteiros. Aceita número
ou string; prefira string para preservar precisão. Produto deve estar ativo,
controlar estoque e ter vínculo ativo com a empresa. Local e setor devem estar
ativos e pertencer à mesma empresa. `idSetor` é necessário porque o schema exige
setor na posição de estoque. Uma posição existente não pode trocar de setor.
As duas unicidades existentes (empresa/local/produto e empresa/setor/produto)
são respeitadas; conflito retorna 409. Observação é obrigatória, com até 255 caracteres.

## Ajuste por inventário

```json
{
  "idProduto": 1,
  "idLocalEstoque": 2,
  "idSetor": 3,
  "saldoNovo": "8.000",
  "saldoEsperado": "10.125",
  "observacao": "Contagem física do inventário"
}
```

`saldoNovo` é o saldo físico absoluto desejado, podendo ser zero. `saldoEsperado`
deve coincidir com o saldo no momento da transação; caso contrário, retorna 409.
O movimento registra a diferença positiva ou negativa, nunca substitui o histórico.
Ajuste sem diferença retorna 400. Saída que ultrapassa o saldo retorna 409.
Entradas e ajustes que ultrapassam Decimal(15,3) retornam 400.

Sucesso de escrita retorna 201:

```json
{
  "idMovimentacao": 45,
  "idMovimentacaoAbertura": null,
  "idProduto": 1,
  "idLocalEstoque": 2,
  "idSetor": 3,
  "operacao": "saida",
  "quantidade": "2.125",
  "saldoAnterior": "10.125",
  "saldoAtual": "8.000"
}
```

## Saldo, histórico e compatibilidade

O saldo é a soma de entradas menos saídas de `movimentacao_estoque` filtrada por
empresa, local e produto. Considera os oito tipos existentes; quantidades dos
movimentos são magnitudes positivas. Movimentos manuais usam `AJUSTE_ENTRADA`
ou `AJUSTE_SAIDA`, porque o enum não possui tipos genéricos ENTRADA/SAIDA.
`origem_tipo` identifica `API_ENTRADA`, `API_SAIDA` ou `API_AJUSTE`; não são
inventados vínculos de nota fiscal, venda ou produção.

`estoque.quantidade` mantém a projeção desse histórico para compatibilidade com
relatórios e estoque mínimo. Cada escrita também cria kardex com saldo anterior
e atual, e auditoria com usuário e motivo, na mesma transação.

Consulta retorna `saldo`, `saldoArmazenado`, `quantidadeReservada`, `movimentos`,
`precisaAbertura` e `consistente`. Usa snapshot RepeatableRead e não grava nada.
Posição inexistente retorna zero para produto/local válidos. Produto/local
inativo ou sem vínculo com a empresa retorna 404.

Para posições antigas com saldo físico positivo e **nenhuma movimentação**, a
primeira escrita registra uma abertura `SALDO_INICIAL` com o saldo antigo,
kardex e auditoria, antes do movimento solicitado. A resposta identifica essa
abertura em `idMovimentacaoAbertura`. Para ajustar um legado, use seu
`saldoArmazenado` como `saldoEsperado`. Se a operação falhar, a abertura também
é revertida. Saldo legado negativo é bloqueado.

O recebimento de compras e esta API compartilham `estoque/estoque.livro.ts`: usam
o mesmo lock de produto e registram a abertura antes de somar novas entradas.
Para posições afetadas pelo recebimento antigo, a abertura só é recuperada quando
**todos** os movimentos existentes são recebimentos de compras e cada kardex
comprova empresa, local, setor, quantidade, saldo anterior/atual e continuidade.
O último saldo precisa coincidir com a posição armazenada. O saldo inicial vem
do primeiro kardex, nunca de uma diferença presumida. A abertura fica datada um
segundo antes do primeiro recebimento; sua auditoria, criada no momento da operação,
registra `fundamento: KARDEX_COMPRAS` e os IDs da cadeia usada como prova. A resposta
identifica a abertura em `idMovimentacaoAbertura`. Sem prova completa ou havendo
movimentos de outra origem, retorna 409 e não altera nada. Não é uma reconciliação
genérica de históricos divergentes.

Reservas não alteram o saldo físico e não são consumidas por esta API. A saída manual respeita o saldo reservado e a classificação da grade; não consome reservas operacionais. Os documentos usam `movimentarNaTransacao` dentro da transação original. Reservas, saída da entrega, entrada da produção e transferências são integradas nesta entrega, conforme [operações integradas](../../../docs/operacoes-integradas.md). Custeio permanece no contrato anterior. `valor_total` permanece no default existente, sem recalcular custos.

## Concorrência e erros

Escritas usam Serializable e `SELECT ... FOR UPDATE` no vínculo produto/empresa.
O lock existe antes da primeira posição e serializa todas as escritas deste
produto na empresa. Em seguida o saldo é apurado pelo histórico e a projeção é
atualizada com condição sobre o saldo anterior. Movimento, projeção, kardex,
abertura e auditoria são atômicos. Não há repetição automática nem idempotência
de POST: se houver dúvida sobre a resposta, confira o histórico antes de reenviar.
Outros módulos que escreverem estoque devem manter esse mesmo protocolo e histórico.
Disputas do driver MariaDB também são classificadas pelo helper compartilhado
`prisma-concorrencia.ts`, incluindo P2010/1213, P2010/1205 e DriverAdapterError.
Falhas inesperadas retornam 500 genérico e os logs não recebem a exceção bruta.

Erros: `{ "error": "mensagem" }`, 400 para dados inválidos, 401 para JWT
ausente/inválido, 403 para acesso negado, 404 para recursos não disponíveis na
empresa, 409 para saldo insuficiente/divergente ou concorrência e 500 para falha
inesperada. Todas as respostas usam `Cache-Control: no-store`.

## Verificação

```powershell
npm test -- tests/unit/movimentacoes-estoque
# Banco local já preparado, nunca executa DDL e remove só as fixtures próprias:
node tests/movimentacoes-estoque.integration.test.mjs --configured-db
# Mesmos cenários nas URLs HTTP reais (inicia e encerra Next local temporário):
node tests/movimentacoes-estoque.integration.test.mjs --configured-db --http
# Alternativa: URL explícita, com host local:
$env:MOVIMENTACOES_ESTOQUE_TEST_DATABASE_URL = 'mysql://usuario:senha@127.0.0.1:3306/erp_test'
node tests/movimentacoes-estoque.integration.test.mjs
```

A integração invoca os handlers reais com JWT e Prisma reais, sem mock de banco.
Verifica isolamento, revogação, precisão, ajustes, rollback, kardex, auditoria,
abertura de saldo antigo e duas baixas/ajustes simultâneos. `--http` exige que não
haja outro `next dev` neste diretório (lock de desenvolvimento compartilhado).
Sem banco configurado,
falha explicitamente em vez de considerar concorrência aprovada.
