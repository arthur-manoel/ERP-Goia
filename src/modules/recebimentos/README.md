# Recebimentos de contas a receber

`GET/POST /api/contas_receber/{id}/recebimentos` e
`GET /api/contas_receber/opcoes-recebimento` usam JWT real e empresa ativa.
Leitura exige FINANCEIRO ler; baixa exige também editar e perfil financeiro.

O POST exige `Idempotency-Key` e corpo como:

```json
{
  "valor": "50.00",
  "data": "2026-11-01",
  "formaPagamento": "PIX",
  "idContaBancaria": 1,
  "referencia": "Recibo do cliente",
  "observacao": "Recebimento parcial"
}
```

Substitua os exemplos por dados do ambiente. A data deve estar entre o lançamento
e hoje. Saldo não é enviado; é recalculado sob lock. Pagamento, movimento financeiro,
saldo/situação e auditoria têm a mesma transação. Resposta nova é 201; repetição
íntegra é 200; conflito de saldo/chave/histórico é 409. Não há estorno ou integração
bancária externa. As telas estão em `/financeiro` e `/financeiro/contas-receber`.

[Contrato completo, migração incremental, histórico legado e reprodução local](../../../docs/operacoes-integradas.md).
