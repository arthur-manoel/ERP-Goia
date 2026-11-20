# Livro de lançamentos financeiros

A tela `/financeiro` consulta `movimentacoes_financeiras`. Contas a receber, liquidações e documentos de origem continuam nos fluxos existentes. Cada linha representa um lançamento do livro, inclusive entradas de recebimentos e saídas de pagamentos, despesas ou reembolsos. A tela não soma o valor do título ou do pagamento ao movimento.

## Contrato

- GET `/api/financeiro/lancamentos?de=AAAA-MM-DD&ate=AAAA-MM-DD`: aceita `pagina`, `idConta`, `idCategoria`, `tipo`, `origem` e `busca`. O período inclusivo de até 366 dias usa a data financeira e o fuso de São Paulo. Ordena por data e ID decrescentes, com 25 por página e até 4.001 páginas acessíveis. Filtros, contagem, lista e resumos usam a mesma transação de leitura.
- GET `/api/financeiro/lancamentos/{id}`: mostra o movimento e a referência financeira já vinculada, quando íntegra e pertencente à empresa. Categoria legada deriva do título ou despesa da mesma empresa. Um reembolso vinculado aparece com origem Reembolso, mesmo quando a origem gravada é AJUSTE.
- GET `/api/financeiro/lancamentos/opcoes`: contas e categorias da empresa, ativas e inativas para consulta histórica. Aceita busca por nome via `conta` e `categoria`; retorna até 500 de cada por consulta e sinaliza quando há mais.
- POST `/api/financeiro/lancamentos`: exige `Idempotency-Key` e JSON com `idConta`, `idCategoria`, `tipo` (ENTRADA ou SAIDA), `valor` (decimal positivo de até duas casas), `data`, `descricao` e `observacao` opcional. Texto limitado a 255 caracteres por campo. O servidor grava a origem AJUSTE, com autoria na auditoria, sem criar título. A categoria ativa deve corresponder a receita/entrada, despesa/saída ou AMBOS. A data fica entre o cadastro da conta ativa e hoje. Inativação preserva histórico e impede novas operações.

As rotas usam o perfil financeiro existente, Bearer JWT e empresa ativa. Leituras exigem FINANCEIRO ler. Escrita exige também FINANCEIRO criar, revalidada na transação e antes do replay. Campos derivados e referências de documentos não são editáveis pelo lançamento manual. Correções de movimentos vinculados seguem o módulo de origem. A tela consulta transferências já gravadas; não oferece uma nova operação de transferência, exclusão ou edição de valor efetivado.

Movimento, auditoria e confirmação idempotente entram na mesma transação. A chave considera a identidade original, o usuário e o conteúdo normalizado. A repetição confirmada devolve 200 e o resultado original, enquanto nova gravação devolve 201. Recusa de negócio confirmada devolve `LANCAMENTO_RECUSADO` somente depois de rollback e confirmação da recusa para a mesma chave. Resposta inconclusiva preserva chave e conteúdo até a recuperação.

## Valores e banco

Entradas, saídas e líquido filtrados se referem ao conjunto da consulta, em valores decimais exatos. Com uma conta selecionada, saldo atual é seu saldo inicial mais entradas menos saídas do livro da conta até o fim do dia atual, independentemente do recorte filtrado. A tela não deduz um saldo de abertura do período a partir dos totais filtrados.

O incremento DB-first `20261120000000_lancamentos_financeiros_categoria` acrescenta a categoria explícita ao movimento com vínculo composto pela empresa. A equipe aplica o incremento ao banco do ambiente antes da instalação. Os registros anteriores conservam categoria direta nula e todos os seus valores e vínculos. O Prisma Client deve ser gerado com o schema versionado.
