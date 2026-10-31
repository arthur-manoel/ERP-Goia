# Testar movimentações de estoque no Postman

1. Inicie a aplicação com `npm run dev`.
2. Importe `movimentacoes-estoque.postman_collection.json` no Postman.
3. Nas variáveis da coleção, preencha `baseUrl` (padrão `http://localhost:3000`),
   `email`, `password`, `idEmpresa`, `idProduto`, `idLocalEstoque` e `idSetor`.
4. Use um produto/local/setor exclusivo para testes: este fluxo altera o saldo.
   O produto deve estar ativo, controlar estoque e ter vínculo ativo com a empresa.
   Local e setor devem estar ativos e pertencer à mesma empresa. Se a posição já
   existir, use seu setor atual. O usuário precisa ler/criar/editar ESTOQUE ou ter
   nível ADMIN/EMPRESA e vínculo ativo com a empresa.
5. Execute as requisições numeradas na ordem. O login salva `accessToken` na
   variável `token`; a coleção envia Bearer e `X-Empresa-Id` automaticamente.
   Não é necessário preencher `token` nem `saldoEsperado` manualmente.

| Etapa | Operação | Resultado esperado |
| --- | --- | --- |
| 01 | Login com e-mail e senha | 200; salva token |
| 02 | Consultar saldo inicial | 200; salva saldo esperado |
| 03 | Ajustar saldo para 10 | 201; se já era 10, pule esta etapa |
| 04 | Entrada de 2 | 201; saldo 12 |
| 05 | Saída de 3 | 201; saldo 9 |
| 06 | Ajustar saldo para 8 | 201; saldo 8 |
| 07 | Tentar saída de 9 | 409; saldo permanece 8 |
| 08 | Ajustar com saldo esperado 7 | 409; saldo permanece 8 |
| 09 | Entrada com quantidade zero | 400 |
| 10 | Consultar sem token | 401 |
| 11 | Conferir saldo antes da concorrência | 200; saldo 8 e consistente |
| 12 | Enviar duas saídas de 6 em paralelo | uma 201, outra 409; saldo 2 |
| 13 | Conferir saldo final | saldo e saldo armazenado 2.000; consistente true |

A etapa 12 começa com um GET e seu script de pós-resposta dispara as duas saídas
simultaneamente. Veja as asserções em **Test Results**. O Runner comum executa
etapas em sequência; a concorrência é criada pelo script desta etapa.

As escritas aceitam JSON. Exemplo de entrada ou saída:

```json
{
  "idProduto": 1,
  "idLocalEstoque": 2,
  "idSetor": 3,
  "quantidade": "2.000",
  "observacao": "Teste manual"
}
```

Use IDs reais e os endpoints POST `/api/estoque/entradas` ou
`/api/estoque/saidas`. Para POST `/api/estoque/ajustes`, substitua `quantidade`
por `saldoNovo` e `saldoEsperado`. Consulta:
GET `/api/estoque/saldo?idProduto=1&idLocalEstoque=2`.

Saldo legado sem movimentações pode retornar `precisaAbertura: true`. Nesse caso,
a coleção sempre usa `saldoArmazenado` como saldo esperado; a primeira escrita registra
a abertura dentro da mesma transação. Divergência com histórico existente retorna
409 e exige investigação antes de continuar, salvo a abertura antiga de compras
comprovada por toda a cadeia de kardex e auditada pelo backend. Isso também cobre
o legado que já recebeu compras: a consulta pode mostrar histórico 5 e saldo
armazenado 15; o ajuste deve esperar 15, não 5.

Se o token expirar, execute o login novamente. Repetir todo o fluxo exige começar
pela etapa 02 para atualizar o saldo esperado. Não exporte a coleção com senha ou
token preenchidos para compartilhamento.
