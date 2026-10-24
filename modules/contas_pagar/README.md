# Contas a pagar

Módulo organizado como Contas a Receber: schemas Zod, repository Prisma, service
de negócio e rotas App Router. Respostas e try/catch centralizados pelo helper
`handleRequest`, que utiliza `NextResponse.json()`.

## Endpoints e segurança

- `GET/POST /api/contas_pagar`.
- `GET/PUT/PATCH/DELETE /api/contas_pagar/:id`.
- JWT obrigatório, papel ADMINISTRACAO ou FINANCEIRO, vínculo ativo, empresa ativa e
  permissão FINANCEIRO por operação (`pode_ler/criar/editar/excluir`). As exceções de
  administrador global e nível EMPRESA são as mesmas do autorizador existente e
  continuam exigindo vínculo ativo.
- `X-Empresa-Id`, quando presente, restringe a operação à empresa escolhida. Corpo
  ou filtros de outra empresa retornam 403; IDs inacessíveis retornam 404.
- Rate limit por usuário já autenticado/processo: 120 leituras e 30 escritas por
  minuto. Coleção e ID compartilham contadores; tokens inválidos não os consomem.
  Alterar IP ou capitalização de Bearer não cria outro contador. Limite entre
  instâncias requer uma store compartilhada, conforme o limitador existente.

## Cadastro e edição

Campos obrigatórios: `id_empresa`, `id_compra`, `id_categoria`, `data_vencimento`,
`valor_original`. **O Prisma atual exige id_compra**, inclusive para obrigações
operacionais associadas a uma conta. Títulos totalmente independentes de compra
exigiriam uma mudança de modelo, que não é feita por este módulo.

Parcelas padrão 1; desconto/acréscimo padrão zero; situação ABERTO. A compra deve
existir na empresa e não estar cancelada; categoria deve ser ativa e permitir
DESPESA ou AMBOS na mesma empresa. Descrição: até 255 caracteres; observação
opcional. O cliente não pode enviar `id`, `valor_final`, datas de auditoria ou
`saldo` (esse último não existe no modelo atual de contas a pagar).

Dinheiro aceita número JSON ou string decimal com ponto, até duas casas, dentro
de DECIMAL(15,2). O cálculo usa Prisma.Decimal:

```text
valor_final = valor_original - valor_desconto + valor_acrescimo
100.00 - 10.00 + 5.00 = 95.00
```

Exemplo:

```json
{
  "id_empresa": 10,
  "id_compra": 20,
  "id_categoria": 30,
  "data_vencimento": "2026-11-10",
  "valor_original": "100.00",
  "valor_desconto": "10.00",
  "valor_acrescimo": "5.00"
}
```

PUT exige os campos obrigatórios e restaura opcionais omitidos aos padrões.
PATCH permite atualização parcial não vazia e mantém os demais valores. Ambos
validam novamente parcelas, relações e resultado calculado após a releitura.
Datas de lançamento/cadastro usam os defaults do banco; atualização é definida
pelo servidor. Contas com despesas vinculadas não podem ser transferidas para
outra empresa, preservando seus relacionamentos históricos.

## Situação e histórico

A API expõe ABERTO, PAGO, PARCIAL, VENCIDO e CANCELADO. VENCIDO corresponde a
ATRASADO no enum Prisma. Contas pagas, parciais, canceladas ou com pagamentos
permitem apenas descrição e observação; não podem ter valores, vínculos,
vencimento, parcelas ou situação alterados por este cadastro. A atualização de
metadados desses títulos preserva os valores financeiros auditados.

A proteção anterior contra baixa fictícia continua em vigor: POST/PUT/PATCH não
marcam títulos como PAGO ou PARCIAL. Uma futura baixa deverá registrar pagamento
e movimentação na mesma transação e atualizar a situação considerando o saldo
apurado pelos pagamentos. Até esse fluxo existir, inclusive VENCIDO para PAGO
retorna 409. Nenhum pagamento ou movimentação é criado implicitamente.

DELETE altera a situação para CANCELADO; nunca apaga dados. Repetir o cancelamento
é idempotente. Títulos pagos/parciais/com pagamentos não podem ser cancelados por
esta API. O mesmo bloqueio vale para contas com despesas pagas vinculadas.
Despesas e registros de pagamentos históricos são preservados.

Criação, edição e cancelamento são auditados pelo helper financeiro na mesma
transação, com autor do JWT e snapshots antes/depois. Falha na auditoria aborta
a escrita. Uma futura baixa também deverá usar esse helper na transação de
pagamento e movimentação; o cadastro não simula esse fluxo.

## Consulta

Paginação obrigatória: `page=1`, `limit=20`, máximo 100. Filtros `id_empresa`,
`id_compra`, `id_categoria`, `situacao`, `descricao`, `busca`, `data_vencimento`
ou `data_vencimento_inicio/fim`, `data_lancamento_inicio/fim`. Datas civis usam
AAAA-MM-DD em UTC; o fim do lançamento inclui o dia inteiro.
`ordenar_por=id|descricao|data_vencimento|data_lancamento|data_cadastro|valor_final`,
`ordem=asc|desc`. Filtro, ordenação, paginação e count ocorrem no banco.
Linhas e total compartilham o mesmo snapshot e escopo empresarial.

```json
{ "success": true, "data": { "rows": [], "count": 0, "page": 1, "limit": 20, "totalPages": 0 } }
```

Erros: 400 validação/relacionamentos; 401 autenticação; 403 empresa/permissão;
404 conta inexistente/inacessível; 409 estado incompatível, baixa sem fluxo,
unicidade ou conflito concorrente; 429 limite; 500 mensagem genérica e log interno.

## Concorrência

Toda escrita ocorre em uma transação READ COMMITTED. São bloqueadas primeiro as
empresas autorizadas em ordem crescente e, em atualização/cancelamento, a linha
da conta usando SELECT FOR UPDATE. **A leitura dos valores ocorre depois desse
bloqueio**, no mesmo TransactionClient da validação, cálculo e gravação. Assim a
segunda edição lê o desconto/acréscimo já confirmado pela primeira. O mecanismo
não depende da precisão de data_atualizacao e funciona entre processos conectados
ao mesmo MySQL/InnoDB. Deadlocks/conflitos são respondidos com 409.

Testes em `tests/unit/contas_pagar` reproduzem as duas ordens de PATCH simultâneos
para 100 - 10 + 5, mantendo 95.00, e verificam uso do TransactionClient e SQL de
bloqueio. O banco é mockado: esses testes não substituem teste concorrente com
MySQL real. Futuros fluxos de pagamento/despesas devem respeitar a mesma ordem de
locks. O schema atual é reutilizado; nenhuma migration nem alteração no banco é
executada pelo módulo.
