# Transferência física de peças prontas

O fluxo está em `/estoque/reservas`, na área **Transferência física entre
fábrica e loja**. A conclusão da OP registra a entrada na fábrica. A expedição
baixa a posição indicada e deixa as peças em trânsito. A loja informa a
quantidade contada e, se ela coincidir com a esperada, o recebimento credita
a posição de destino. Falta ou sobra exige nova conferência ou regularização
pela equipe. O saldo da loja fica intacto enquanto houver divergência.

A posição é específica por empresa, produto e local, com um setor associado.
O cadastro atual também tem unicidade por empresa, produto e setor. O fluxo
usa locais e setores ativos configurados na empresa, sem classificação
estrutural de fábrica e loja. Se faltar a posição de destino, o envio
vincula o local e o setor usando o cadastro de estoque com saldo zero.
Assim, outra expedição incompatível é recusada antes de baixar a origem.
O saldo segue a unidade do produto e a escala
de até três casas adotada pelo serviço de estoque. Estoque sem variação é
tratado separadamente da grade. Não há atribuição de OP ou lote ao saldo
agrupado.

## Contrato HTTP

Use Bearer e a empresa ativa validada pelo servidor. As consultas exigem
`ESTOQUE/pode_ler`. Envio e recebimento exigem leitura e edição de estoque
e `Idempotency-Key`. As respostas são privadas e sem cache.

| Método | Caminho | Conteúdo |
| --- | --- | --- |
| GET | `/api/estoque/transferencias` | `pagina`, `limite` até 100, `status`, `idLocalDestino` e `idTransferencia` opcionais. |
| POST | `/api/estoque/transferencias/enviar` | `idProduto`, `idVariacao` opcional, `idLocalOrigem`, `idSetorOrigem`, `idLocalDestino`, `idSetorDestino`, `quantidade`, `observacao`. |
| POST | `/api/estoque/transferencias/{id}/receber` | `{ "quantidade": "6.000" }`. A quantidade vem da conferência. |

A lista aplica os filtros antes da contagem e ordena por ID decrescente.
Retorna `dados`, `total`, `pagina`, `totalPaginas` e `podeMovimentar`.
Cada registro inclui os IDs do documento, os nomes disponíveis das posições,
produto, variação, unidade, datas, estado e autoria comprovada. Consultas
de históricos antigos não atribuem contagens ou autores ausentes.

Na API, quantidades são strings decimais com ponto, até 12 dígitos inteiros
e três casas. A interface também aceita vírgula. Zero na conferência é uma
contagem válida que resulta em divergência. Campo ausente ou inválido retorna
400. Divergência, saldo insuficiente ou posição incompatível retorna 409.
O destino e o item da entrada vêm do registro enviado.

O servidor consulta a identidade da operação antes da escrita na transação
de estoque. A mesma chave e o mesmo conteúdo recuperam o resultado original.
A mesma chave com conteúdo diferente retorna 409. Uma confirmação concorrente
com outra chave e contagem correta recebe a referência da entrada já registrada.
A API só aceita o antigo corpo `{}` para recuperar um resultado já gravado
com exatamente essa chave e esse conteúdo. Uma tentativa nova sempre requer
contagem.

Tentativas novas são preservadas por ID de usuário e empresa. Para uma
tentativa da interface antiga, vinculada por e-mail, a interface envia
`X-Recuperar-Transferencia: 1`. Esse modo só retorna uma operação já gravada
com os mesmos usuário, empresa, chave e conteúdo. Se não houver resultado
da conta atual, retorna 404 com `RECUPERACAO_INDISPONIVEL`. Confira o
histórico antes de iniciar uma nova transferência.

Uma transferência pendente de recuperação bloqueia novos envios e
recebimentos dessa conta na mesma empresa. As outras operações têm
recuperação própria e continuam disponíveis conforme suas permissões.

A expedição e as alterações cadastrais usam o bloqueio da empresa. Enquanto
houver peças em trânsito, a inativação do local ou do setor de destino, a
inativação do produto, a inativação ou troca de empresa das dimensões da
grade usada e a desativação do controle de estoque do produto são recusadas
para preservar o recebimento.

A saída, a entrada e a mudança de situação usam o serviço canônico e suas
transações. A auditoria da transferência recebida registra a quantidade
conferida. O movimento de entrada registra usuário e horário. Esta entrega
reutiliza as tabelas e migrations existentes.

## Verificação local

Execute a integração `node --test tests/operacoes-integradas.integration.test.mjs`
com build de produção e MariaDB/MySQL isolado. O teste usa
`RECEBIVEIS_TEST_DATABASE_URL` e a preparação do esquema operacional atual.
