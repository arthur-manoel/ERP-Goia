# API do Kardex físico

`GET /api/estoque/kardex` consulta o livro de estoque. Envie `Authorization:
Bearer <JWT>` e `X-Empresa-Id` para escolher um vínculo ativo. O cabeçalho é
obrigatório quando a pessoa tem mais de um vínculo ativo. A rota é operacional
e exige `ESTOQUE / ler` nos mesmos perfis e vínculos de `/api/estoque/saldo`.
As exceções administrativas continuam exigindo vínculo ativo com empresa ativa.
Respostas usam `Cache-Control: private, no-store`.

## Filtros e navegação

| Parâmetro | Regra |
| --- | --- |
| `dataInicio`, `dataFim` | Datas civis `YYYY-MM-DD` com ano entre 1970 e 9998, ambas inclusivas em `America/Sao_Paulo`. Envie ambas ou omita ambas. Padrão de 30 dias até hoje, máximo de 366 dias por consulta. Para histórico antigo, informe o intervalo desejado. |
| `idProduto`, `idLocalEstoque`, `idSetor`, `idVariacao` | IDs positivos. Cadastros inativos continuam consultáveis. A variação, quando combinada com o produto, deve pertencer a ele. |
| `direcao`, `tipo` | `ENTRADA` ou `SAIDA` e tipo detalhado do enum de movimentação. Ambos devem ser compatíveis quando informados juntos. |
| `idMovimentacao` | Localiza o lançamento associado ao movimento no período. |
| `origemTipo`, `origemId` | Tipo persistido em maiúsculas, de até 50 caracteres. Para filtrar o ID informe também o tipo. |
| `pagina`, `limite` | Começam em 1 e 25 por padrão. Página máxima 10.000, até 100 registros por página e deslocamento máximo de 100.000 registros. |

Tipos atuais incluem `ENTRADA_NF`, `SAIDA_VENDA`, `ENTRADA_PRODUCAO`,
`SAIDA_PRODUCAO`, `AJUSTE_ENTRADA`, `AJUSTE_SAIDA`,
`TRANSFERENCIA_ENTRADA` e `TRANSFERENCIA_SAIDA`. O filtro de período usa a
data gravada em `kardex.data_movimentacao` e o início exclusivo do dia seguinte
à data final. O resultado vem do mais novo para o mais antigo, com desempate
por ID do lançamento em ordem decrescente. Uma página além do fim retorna
`dados: []` e conserva a contagem. Uma leitura `RepeatableRead` mantém
página, contagem e resumo no mesmo snapshot. Escritas entre requisições
podem deslocar resultados de páginas diferentes. Para atualizar a navegação,
volte à primeira página com os mesmos filtros.
[Leitura consistente no InnoDB](https://dev.mysql.com/doc/refman/8.4/en/innodb-consistent-read.html)

Filtro, ordenação, resumo e data ISO usam o instante armazenado no
`TIMESTAMP`, mesmo quando o fuso da sessão do banco difere de UTC.

## Resposta e consumo pela tela

O envelope contém `idEmpresa`, `periodo`, `dados`, `paginacao` e
`resumo`. Cada linha tem `id` do Kardex, `idMovimentacao`,
`dataMovimentacao` em ISO 8601, `produto` com nome e unidade, `localEstoque`,
`setor`, `variacao`, `direcao`, `tipo`, `quantidade`, `delta`,
`saldo`, `origem`, `observacao`, `idMovimentoRelacionado` e
`idMovimentoOriginal`. Quantidades e saldos são strings com três casas.
A quantidade é o valor gravado no livro. O delta sinalizado é fornecido
quando o efeito do lançamento confere com o movimento.

Exemplo de uma entrada filtrada pela variação M:

```json
{
  "id": 91,
  "idMovimentacao": 115,
  "dataMovimentacao": "2026-10-08T15:30:00.000Z",
  "produto": { "id": 32, "nome": "Camisa", "unidade": "UN" },
  "localEstoque": { "id": 5, "nome": "Loja" },
  "setor": { "id": 8, "nome": "Expedição" },
  "variacao": { "id": 43, "cor": "Azul", "tamanho": "M" },
  "direcao": "ENTRADA",
  "tipo": "TRANSFERENCIA_ENTRADA",
  "quantidade": "2.300",
  "delta": "2.300",
  "saldo": {
    "escopo": "POSICAO_AGREGADA",
    "situacao": "REGISTRADO",
    "anterior": "10.000",
    "posterior": "12.300"
  },
  "origem": { "tipo": "TRANSFERENCIA_RECEBIMENTO", "id": 19 },
  "observacao": null,
  "idMovimentoRelacionado": 114,
  "idMovimentoOriginal": null
}
```

Os saldos da linha pertencem à posição agregada do produto. O filtro por
variação seleciona lançamentos, e o saldo continua incluindo toda a grade
daquela posição. `variacao: null` indica ausência de classificação no
movimento associado ou vínculo que não pôde ser confirmado. O histórico
disponível não comprova se uma variação já existia na data do lançamento.
Nomes, unidade, cor e tamanho vêm do cadastro atual. Local e setor nulos
preservam a ausência do registro ou indicam referência fora do contexto.
Se movimento, direção, quantidade, posição ou aritmética divergir, a linha
marca `saldo.situacao: "DIVERGENTE"` e devolve `delta` e saldos nulos.
`idMovimentacao`, `tipo` e `quantidade` são nulos se o movimento correspondente
não puder ser associado com segurança. `produto` é nulo quando também não
houver vínculo do cadastro na empresa. Cor e tamanho podem faltar na variação.
`origem` é nula quando o tipo não foi gravado ou o movimento não foi associado.
O ID de origem pode ser nulo, por exemplo em uma entrada manual.

A tela pode abrir a própria linha ou localizar um movimento pelo seu ID.
Use `origem.tipo` e `origem.id` juntos para encaminhar ao módulo responsável.
A consulta do documento deve usar a autorização daquele módulo. O Kardex
devolve a referência persistida e, quando comprovável, o movimento da outra
ponta da transferência, a contraparte de descarte e a saída original da
devolução. Referências ausentes são nulas. A observação é retornada somente
nos movimentos manuais `API_ENTRADA`, `API_SAIDA` e `API_AJUSTE`.
Origem documental, autoria e valores monetários continuam sujeitos aos
contratos dos módulos responsáveis.

## Resumo da posição

Com produto e local, a rota confronta os lançamentos e seus movimentos
vinculados na ordem efetiva, incluindo históricos retrodatados. O saldo
inicial da cadeia deve partir de zero. Cada saldo posterior deve continuar
no lançamento seguinte. O setor da posição deve ser conhecido e compatível,
e o saldo final do livro deve coincidir com a projeção física armazenada.
A projeção apenas confirma o livro. O saldo reservado, o disponível e a
projeção da variação pertencem às consultas atuais de estoque.

Com abertura anterior ao período de `10.000`, entrada de `2.300` e saída
de `1.200`, o resumo é:

```json
{
  "situacao": "COMPROVADO",
  "motivo": null,
  "escopo": "POSICAO_AGREGADA",
  "posicao": { "idEmpresa": 2, "idProduto": 32, "idLocalEstoque": 5, "idSetor": 8 },
  "unidade": "UN",
  "saldos": { "abertura": "10.000", "entradas": "2.300", "saidas": "1.200", "fechamento": "11.100" }
}
```

O resumo inclui todos os movimentos da posição durante o período, inclusive
o lançamento `SALDO_INICIAL` na sua data efetiva quando houver. Direção,
tipo, movimento, origem, variação e paginação afetam a listagem. Em período
posterior sem movimentos, abertura e fechamento iguais são retornados quando
há saldo anterior comprovado.

Com posição incompleta, a consulta geral pode devolver, por exemplo:

```json
{
  "idEmpresa": 2,
  "periodo": { "dataInicio": "2026-10-01", "dataFim": "2026-10-31" },
  "dados": [],
  "paginacao": { "pagina": 1, "limite": 25, "totalRegistros": 0, "totalPaginas": 0 },
  "resumo": { "situacao": "SEM_ESCOPO", "motivo": "INFORME_PRODUTO_E_LOCAL", "saldos": null }
}
```

Com posição informada e histórico insuficiente, `resumo.situacao` é
`INDISPONIVEL` e `resumo.saldos` é nulo. O motivo indica ausência de
posição ou lançamentos, vínculo incompleto, cadeia ou projeção divergente,
ou período anterior ao histórico comprovável. Movimentos sem Kardex afetam
a prova da posição. O GET consulta somente os lançamentos existentes.

## Erros e validação local

Erros devolvem `{ "error": "mensagem" }`. HTTP 400 cobre filtros inválidos,
repetidos, incompatíveis ou empresa obrigatória omitida. HTTP 401 indica
sessão inválida, 403 acesso negado, 404 referência fora do contexto ou
inexistente, 429 limite de 120 leituras por usuário por minuto e 500 falha
interna.

Prepare o MariaDB local e isolado conforme o
[guia de operações integradas](../../../docs/operacoes-integradas.md).
No snapshot atual, aplique também os DDLs existentes de eventos de
apontamentos, confirmações de produção, plano de pagamento de compra e
revogação de sessões, na ordem das migrations. Em uma base dedicada vazia
com sufixo `_test`, aponte `RECEBIVEIS_TEST_DATABASE_URL` para essa base,
compile a aplicação e execute:

```sh
node --test tests/kardex.integration.test.mjs
node --test tests/operacoes-integradas.integration.test.mjs
node --test tests/cancelamentos.integration.test.mjs
```

O teste de volume usa o gerador `seq_1_to_20000` do MariaDB. O endpoint usa
SQL parametrizado e funções de janela compatíveis com MariaDB e MySQL 8.
O card usa as tabelas e índices vigentes.
