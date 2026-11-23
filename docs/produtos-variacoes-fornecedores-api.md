# API de variações e fornecedores do produto (#27)

Os caminhos abaixo são relativos a `/api/produtos/{idProduto}`. Use
`Authorization: Bearer <access_token>` e `X-Empresa-Id: <id>` em todas as
chamadas. O usuário, a sessão, o vínculo e a empresa devem estar ativos. O
recurso é `PRODUTOS` e a empresa precisa estar vinculada ao produto. Os
cadastros globais permanecem sob a política geral de produtos e fornecedores.

| Método | Caminho | Permissão | Resposta `data` |
| --- | --- | --- | --- |
| GET | `/variacoes` | Ler | Página de variações, incluindo inativas |
| POST | `/variacoes` | Criar | 201 com `{ rows, criadas }` |
| PATCH | `/variacoes/{idVariacao}` | Editar (+ Excluir para inativar) | Variação atualizada |
| GET | `/fornecedores` | Ler | Página de vínculos, incluindo inativos |
| GET | `/fornecedores/opcoes` | Ler | Página de opções elegíveis `{ id, nome }` |
| POST | `/fornecedores` | Criar | 201 com o vínculo criado |
| GET | `/fornecedores/{idVinculo}` | Ler | Vínculo do produto com o fornecedor |
| PATCH | `/fornecedores/{idVinculo}` | Editar (+ Excluir para inativar) | Vínculo atualizado |

O identificador `idVinculo` é a chave de `produto_fornecedor`. A criação
recebe `id_fornecedor`, a chave do cadastro do fornecedor. IDs e empresa da
associação ficam fixos. Os únicos parâmetros de consulta são `page` (1 a
10.000, padrão 1) e `limit` (1 a 100, padrão 20) nos três GETs paginados.
A resposta usa `{ "success": true, "data": { rows, count, page, limit, totalPages } }`
e ordena por ID crescente. Uma página além do fim retorna linhas vazias.
Se o resultado exigir mais páginas que o limite suportado, aumente `limit`.
As respostas são `no-store`.

Corpos de escrita aceitam JSON até 64 KiB. Erros seguem
`{ "success": false, "error": "<mensagem>" }` com 400 para entrada inválida,
401 para sessão inválida, 403 para falta de acesso, 404 para registros fora
do escopo ou fornecedor inelegível, 409 para conflitos operacionais,
de integridade ou concorrência, e 429 por excesso de requisições. As cotas são
120 consultas e 30 escritas por minuto por usuário, independentes entre si.

## Grade

Envie até 200 combinações por lote, com pelo menos uma dimensão em cada uma:

```json
{
  "variacoes": [
    { "id_cor": 1, "id_tamanho": 2 },
    { "id_cor": 1, "id_tamanho": null },
    { "id_tamanho": 3 }
  ]
}
```

Cada linha devolve `id`, `id_empresa`, `id_produto`, `id_cor`,
`id_tamanho` e `status`. Omitir uma dimensão equivale a enviar `null`.
A escrita valida as dimensões das combinações novas e grava todo o lote com
a auditoria na mesma transação. Repetições no corpo são agrupadas. A resposta
mantém a ordem das primeiras ocorrências e conta em `criadas` só linhas
novas. Reenviar uma combinação devolve seu ID existente, inclusive se
inativa. Quando existem duplicatas antigas com dimensão nula, o POST
devolve o menor ID e a leitura preserva todos os registros históricos.

Para alterar disponibilidade, envie `{ "status": "INATIVO" }` ou
`{ "status": "ATIVO" }` ao PATCH da variação. A reativação exige produto,
vínculo, dimensões ativas e ausência de outra combinação ativa igual.
A primeira grade exige regularizar pelo módulo de estoque eventuais saldos
sem classificação e concluir ou liberar documentos e reservas abertos.
A inativação exige saldo físico e reservado zerados e que não haja
transferências, reservas, pedidos ou ordens pendentes da variação. A grade
não distribui saldo nem altera documentos. Devoluções de pedidos rastreadas
pelo movimento de origem preservam a variação histórica, mesmo inativa.
Para usar esse saldo em novas operações, reative a variação com dimensões
e produto elegíveis.

## Fornecedores

```json
{
  "id_fornecedor": 30,
  "codigo_produto_fornecedor": "0007-Ç",
  "preco_ultima_compra": "15.90",
  "prazo_entrega_dias": 0,
  "quantidade_minima": "2.500",
  "fornecedor_principal": true
}
```

O retorno inclui esses campos, `id`, `id_empresa`, `id_produto`,
`status` e `fornecedores: { razao_social, nome_fantasia }`.
O preço no contrato da tela é o **último preço de compra informado pelo
operador**. O cadastro não registra uma compra nem comprova que houve
pagamento. Valores de compras registradas e documentos financeiros continuam
nos respectivos módulos. Use `preco_ultima_compra` para informar esse
dado histórico e mantenha-o nulo quando desconhecido.

Preço aceita string decimal de até 13 dígitos inteiros e 2 casas. Quantidade
mínima aceita 12 dígitos inteiros e 3 casas, na unidade do produto. O prazo é
um inteiro em dias, de 0 a 2.147.483.647. Zero é aceito nos três campos.
O código aceita 100 caracteres, preserva zeros à esquerda e tem os espaços
externos removidos. No PATCH, omissão mantém o valor, e `null` limpa
somente código, preço, prazo ou quantidade. A mudança de situação usa
`{ "status": "INATIVO" }` ou `{ "status": "ATIVO" }`.

Aceitam-se fornecedores próprios ativos e fornecedores globais ativos com
vínculo empresa–fornecedor ativo. Vínculos históricos locais ou globais
continuam consultáveis se o fornecedor perder elegibilidade. O POST
duplicado retorna 409. Use PATCH para reativar o vínculo com o mesmo ID.
Reativar exige elegibilidade e conserva as condições. Inativar limpa a marca
de principal, e reativar por situação mantém o vínculo sem essa marca.
Marcar como principal limpa a marca anterior da mesma empresa e produto e
audita as alterações na mesma transação. Um vínculo que perdeu elegibilidade
deixa de ser apresentado como principal enquanto estiver indisponível.

## Concorrência e banco

As escritas usam a ordem de bloqueio do estoque, empresa, vínculo do produto
e cadastro do produto, seguida dos cadastros de referência. Todas as rotas
que escrevem a grade usam esse protocolo. Assim, o SELECT e o INSERT de
combinações com `NULL` são serializados mesmo quando o índice único do
MySQL aceita mais de uma linha com `NULL`. Os registros da associação com
fornecedores também contam com índice único no banco. Importações externas
devem seguir o mesmo protocolo para preservar a grade.

A entrega reutiliza as tabelas já existentes no schema Prisma. Para os testes
de integração, prepare um MariaDB ou MySQL vazio, local e exclusivo, com o
schema atual. Confira as restrições de `produto_variacoes` e
`produto_fornecedor` com `SHOW CREATE TABLE`; use o contrato DB-first atual
em vez de supor que as migrations antigas cobrem todo o schema. Com o build
feito e `PRODUTO_CONFIGURACAO_TEST_DATABASE_URL` apontando para esse banco
(com sufixo `_test`), execute:

```sh
node --test tests/produto-configuracao.integration.test.mjs
```

O teste cria dados próprios, faz login real e exercita um servidor Next em
modo de produção. Há um gatilho temporário apenas no banco de teste para
verificar rollback após falha de auditoria. O teste remove o gatilho ao fim desse caso.
