# Compras e notas fiscais de entrada

O cadastro fiscal usa as rotas existentes de `/api/compras/notas-fiscais` e a tela `/notas-fiscais`. Registrar/editar o cabeçalho não dá entrada física. `status=RECEBIDA` e `data_recebimento` registram o recebimento documental. `entrada_processada=true` e `data_processamento` só são gravados após todas as linhas terem movimentos comprovados e vinculados, em uma transação atômica.

## Conferência e processamento

- POST do cadastro aceita `itens` opcionais, atomicamente com o cabeçalho. O total da nota deve ser explícito, inclusive para documentos parciais; não é herdado do total da compra inteira.
- GET do detalhe acrescenta itens fiscais, versão, pendências, valores de referência, quantidades da compra, movimentos disponíveis e vínculos já processados.
- Uma nota recebida documentalmente continua editável até processar a entrada. A edição mantém o estado documental e pode completar a compra vinculada e corrigir o total. Cancelamento ou processamento bloqueiam a edição do cabeçalho.
- PUT `/{id}/itens`: `{versaoEsperada,itens,justificativaValores?}`. IDs existentes são preservados; número do item fiscal identifica a linha no documento. Linhas distintas podem mapear o mesmo item da compra/produto. É possível salvar uma conferência incompleta; isso não libera processamento.
- POST `/{id}/processar`: `Idempotency-Key` e `{versaoEsperada,linhas:[{idItem,novaQuantidade,recebimentos:[{idMovimentacao,quantidade}]}]}`. Cada linha deve ter exatamente sua quantidade distribuída entre nova entrada e recebimentos comprovados. A mesma chave/conteúdo recupera o resultado; outra chave numa nota já processada retorna o estado confirmado sem nova entrada.

As linhas preservam código/descrição originais, quantidade/unidade, tipo e valores do documento. O usuário mapeia explicitamente produto, item da compra, variação e destino. Não há seleção por semelhança de descrição nem conversão implícita de unidades: a unidade fiscal deve ser a unidade de estoque. O tipo METRO exige unidade M. Em UNITARIO/METRO, valor total = quantidade × valor unitário, arredondado para centavos por linha com HALF_UP. Em TOTAL, o valor informado no campo de valor representa a linha inteira e não é multiplicado pela quantidade. Entradas com precisão excedida são rejeitadas antes de gravar. A soma dos itens deve coincidir com o total do documento; componentes fiscais separados não estão modelados aqui. Divergência de preço em relação à compra exige justificativa persistida, sem alterar automaticamente a obrigação financeira existente.

## Entrada física única

Compra e nota reutilizam `receberFisico`, o mesmo cliente de transação e `movimentarNaTransacao`, com abertura de saldo, grade, livro, Kardex e auditoria oficiais. Novos recebimentos mantêm a origem `COMPRA_RECEBIMENTO` e registram a linha da compra em `compra_recebimento_linha`. `nota_item_entrada` distribui cada recebimento entre linhas fiscais, limitando a soma ao fato físico original. O processamento pode combinar uma parcela nova com outra já recebida.

A decisão é serializada por empresa/compra, também nos recebimentos iniciados pela compra. O acumulado físico é apurado por ID do item, sem agregar variações distintas do mesmo produto. A compra continua EMITIDA enquanto houver saldo; ao completar, passa a ENTREGUE e atualiza o pedido. A integração não cria um segundo plano ou título a pagar.

Uma associação de histórico exige seleção do movimento, origem de compra, empresa, produto/variação, local/setor, quantidade livre e comprovação íntegra no Kardex. Um recebimento legado pode ser repartido entre linhas da nota com um único vínculo ao movimento físico. Status ENTREGUE isolado não comprova recebimento físico. Históricos ambíguos ou sem livro ficam pendentes de regularização, sem novas entradas presumidas. Chaves antigas presentes somente na observação, sem hash persistido, exigem consulta do histórico antes de outra tentativa. Novas operações usam a identidade persistida em `operacao_erp`, vinculada a autor, empresa, tipo e conteúdo. As chaves dos movimentos gerados pela nota têm escopo próprio em relação ao recebimento direto da compra.

Depois de processada, a nota e suas linhas não podem ser alteradas/canceladas pelos atalhos cadastrais. Efeitos existentes são conservados; uma regularização deve usar o domínio responsável e sua compensação.

## Autorização e implantação

Todas as rotas usam Bearer JWT, vínculo ativo e X-Empresa-Id conforme a autenticação atual. Conferir itens exige editar NOTAS_FISCAIS; processar exige ler/editar NOTAS_FISCAIS, editar COMPRAS e criar ESTOQUE, revalidados dentro da transação e antes do replay. A interface preserva chave e conteúdo em respostas inconclusivas, encerra recusas definitivas e descarta dados de outra empresa.

A equipe responsável pelo banco deve aplicar o incremento DB-first `20261119000000_notas_entrada_rastreavel` antes de instalar esta versão. Os vínculos são nulos nos registros antigos; não há criação de recebimentos, responsáveis ou quantidades fictícios. O incremento acrescenta versão/conferência, relacionamentos por linha e restrições compostas de origem/empresa/compra/produto. Gere o Prisma Client com o schema versionado após a atualização controlada. A introspecção deve manter os complementos Prisma existentes do projeto. O desenvolvimento e os testes utilizam somente MariaDB local isolado.
