# Indicadores reais da dashboard

A dashboard consulta `GET /api/dashboard/{pedidos|ordens|saldo}` pelo provedor de autenticação. Cada indicador carrega de forma independente e compartilha o resultado entre o card e o resumo de atenção. Ao trocar de empresa, resultados de outra empresa não são exibidos; respostas de requisições anteriores são descartadas.

A API valida JWT e sessão ativa, perfil, vínculo ativo do usuário com a empresa e permissão de leitura do recurso. Administradores também precisam de vínculo ativo. Os recursos são `PEDIDOS`, `ORDENS_PRODUCAO` e `FINANCEIRO`; respostas usam `Cache-Control: no-store`. Indicadores sem permissão ficam ocultos.

## Regras

- Pedidos a entregar: `CONFIRMADO`, `EM_PRODUCAO`, `PRONTO`, `EM_ENTREGA` e `PARCIALMENTE_ENTREGUE`. Rascunhos, entregues, concluídos e cancelados ficam fora.
- Prazos: data civil atual em `America/Fortaleza`; grupos de atrasados, hoje e próximos sete dias são exclusivos. Pedidos sem prazo continuam no total e no grupo de demais pedidos. O maior atraso é contado em dias civis.
- OPs abertas: todas exceto `CONCLUIDA` e `CANCELADA`; atraso significa previsão anterior ao dia atual. Sem previsão, a OP continua aberta, sem ser contada como atrasada.
- Saldo do mês: soma das entradas menos soma das saídas de `movimentacoes_financeiras`, filtrada por empresa e mês civil em UTC-03, com fim exclusivo. Transferências internas ficam fora. O cálculo usa `Prisma.Decimal` e devolve decimais em texto; não inclui saldo inicial, títulos a vencer ou valores projetados.
- Ausência de registros gera zero. Comparativos, evolução diária e valor financeiro dos pedidos ficam ausentes enquanto não houver cálculo correspondente.

O modo de demonstração foi removido. `DASHBOARD_DADOS_MOCK` não tem mais efeito.

## Validação

```powershell
npm run test -- tests/unit/dashboard/indicadores.test.ts tests/unit/permissoes/entradas.test.ts
npm run build
# Alternativa de compilador para ambientes Windows com falha local do Turbopack:
node node_modules/next/dist/bin/next build --webpack
$env:DASHBOARD_TEST_DATABASE_URL = "mysql://USUARIO:SENHA@localhost:3306/dashboard_test"
node --test tests/dashboard-banco.integration.test.mjs
```

O teste de integração exige MySQL/MariaDB local com sufixo `_test` e schema atualizado, inclusive a migration `20261110000000_revogacao_sessoes`. Ele cria seus próprios registros, exercita as rotas HTTP de produção com JWT real e remove os registros ao terminar. Não executa migrations automaticamente.

Homologação local: teste HTTP aprovado com banco real em cópia temporária do schema; verificou status, limites de prazo, precisão decimal, limites do mês, empresa vazia, isolamento entre empresas e revogação de leitura financeira. A cópia foi removida após o teste.
